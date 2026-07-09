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
	entries: Array<{ id: string; budget: number }>,
): Promise<string[]> {
	const res = await quota.fetch(
		new Request("https://provider-quota/consume", {
			method: "POST",
			body: JSON.stringify({ entries }),
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

	it("resets counts when the UTC day changes", async () => {
		const { quota, storage } = makeQuota();
		expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
		expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual(["p"]);
		// Pretend the stored counts are from yesterday.
		storage.map.set("day", "1999-01-01");
		expect(await consume(quota, [{ id: "p", budget: 1 }])).toEqual([]);
		expect(storage.map.get("day")).toBe(new Date().toISOString().slice(0, 10));
	});
});

describe("quotaExhaustedProviders", () => {
	const BUDGET_VAR = "HOWISMYIP_PROVIDER_GEOJS_DAILY_BUDGET";

	afterEach(() => {
		delete process.env[BUDGET_VAR];
	});

	it("returns no skips when no provider has a budget", async () => {
		expect(await quotaExhaustedProviders()).toEqual(new Set());
	});

	it("fails open outside the Workers runtime even with budgets set", async () => {
		process.env[BUDGET_VAR] = "0"; // strictest budget: would skip if enforced
		expect(await quotaExhaustedProviders()).toEqual(new Set());
	});
});
