import type { DurableObjectState } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderQuota, quotaExhaustedProviders } from "./provider-quota";

/** In-memory stand-in for the slice of DO storage the counter uses. */
class FakeStorage {
	readonly map = new Map<string, unknown>();

	get(key: string): Promise<unknown>;
	get(keys: string[]): Promise<Map<string, unknown>>;
	get(key: string | string[]): Promise<unknown> {
		if (Array.isArray(key)) {
			const out = new Map<string, unknown>();
			for (const k of key) {
				if (this.map.has(k)) {
					out.set(k, this.map.get(k));
				}
			}
			return Promise.resolve(out);
		}
		return Promise.resolve(this.map.get(key));
	}

	put(key: string, value: unknown): Promise<void>;
	put(entries: Record<string, unknown>): Promise<void>;
	put(a: string | Record<string, unknown>, b?: unknown): Promise<void> {
		if (typeof a === "string") {
			this.map.set(a, b);
		} else {
			for (const [k, v] of Object.entries(a)) {
				this.map.set(k, v);
			}
		}
		return Promise.resolve();
	}

	deleteAll(): Promise<void> {
		this.map.clear();
		return Promise.resolve();
	}
}

function makeQuota() {
	const storage = new FakeStorage();
	const quota = new ProviderQuota({
		storage,
	} as unknown as DurableObjectState);
	return { quota, storage };
}

async function consume(
	quota: ProviderQuota,
	entries: Array<{
		id: string;
		budget: number;
		period?: "day" | "month" | "lifetime";
	}>,
): Promise<string[]> {
	const res = await quota.fetch(
		new Request("https://provider-quota/consume", {
			method: "POST",
			body: JSON.stringify({
				entries: entries.map((e) => ({ period: "day", ...e })),
			}),
		}),
	);
	const { exhausted } = (await res.json()) as { exhausted: string[] };
	return exhausted;
}

describe("ProviderQuota", () => {
	it("allows calls until the budget is spent, then reports exhausted", async () => {
		const { quota } = makeQuota();
		expect(await consume(quota, [{ id: "p", budget: 2 }])).toEqual([]);
		expect(await consume(quota, [{ id: "p", budget: 2 }])).toEqual([]);
		expect(await consume(quota, [{ id: "p", budget: 2 }])).toEqual(["p"]);
		// Exhausted calls don't keep incrementing past the budget.
		expect(await consume(quota, [{ id: "p", budget: 2 }])).toEqual(["p"]);
	});

	it("tracks providers independently", async () => {
		const { quota } = makeQuota();
		const entries = [
			{ id: "small", budget: 1 },
			{ id: "big", budget: 10 },
		];
		expect(await consume(quota, entries)).toEqual([]);
		expect(await consume(quota, entries)).toEqual(["small"]);
	});

	it("treats a zero budget as never callable", async () => {
		const { quota } = makeQuota();
		expect(await consume(quota, [{ id: "p", budget: 0 }])).toEqual(["p"]);
	});

	it("raising the budget unlocks capacity immediately, even mid-period", async () => {
		const { quota } = makeQuota();
		expect(await consume(quota, [{ id: "p", budget: 0 }])).toEqual(["p"]);
		expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
	});

	describe("'day' period (default)", () => {
		it("resets when the stored bucket is an earlier UTC day", async () => {
			const { quota, storage } = makeQuota();
			expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
			expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual(["p"]);
			// Pretend the stored count is from yesterday.
			storage.map.set("period:p", "1999-01-01");
			expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
			expect(storage.map.get("period:p")).toBe(
				new Date().toISOString().slice(0, 10),
			);
		});
	});

	describe("'month' period", () => {
		it("does NOT reset day-to-day within the same UTC month", async () => {
			const { quota } = makeQuota();
			// Two calls on the same real day both fall in the current UTC month,
			// so the second one exhausts a budget of 1 — no per-day reset.
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "month" }]),
			).toEqual([]);
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "month" }]),
			).toEqual(["p"]);
		});

		it("resets only when the UTC month changes", async () => {
			const { quota, storage } = makeQuota();
			storage.map.set("count:p", 1);
			storage.map.set("period:p", "2026-06"); // last month, budget already spent
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "month" }]),
			).toEqual([]);
			expect(storage.map.get("period:p")).toBe(
				new Date().toISOString().slice(0, 7),
			);
		});
	});

	describe("'lifetime' period", () => {
		it("never resets — exhaustion is permanent until the budget is raised", async () => {
			const { quota, storage } = makeQuota();
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "lifetime" }]),
			).toEqual([]);
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "lifetime" }]),
			).toEqual(["p"]);
			// Even simulating a much later date doesn't reset it.
			storage.map.set("period:p", "lifetime");
			expect(
				await consume(quota, [{ id: "p", budget: 1, period: "lifetime" }]),
			).toEqual(["p"]);
		});
	});

	it("treats pre-existing counts with no stored period as a fresh bucket (migration)", async () => {
		const { quota, storage } = makeQuota();
		// Shape written by the old single-"day"-marker scheme: a count with no
		// per-provider period marker at all.
		storage.map.set("count:p", 5);
		expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
	});
});

describe("quotaExhaustedProviders", () => {
	afterEach(() => {
		delete process.env.HOWISMYIP_DAILY_BUDGETS;
	});

	it("returns no skips when no provider has a budget", async () => {
		expect(await quotaExhaustedProviders()).toEqual(new Set());
	});

	it("fails open outside the Workers runtime even with budgets set", async () => {
		// Strictest possible budget: would skip geojs if it were enforced here.
		process.env.HOWISMYIP_DAILY_BUDGETS = "geojs:0";
		expect(await quotaExhaustedProviders()).toEqual(new Set());
	});
});
