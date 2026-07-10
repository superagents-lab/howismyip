/**
 * Per-provider daily call budgets, enforced by a Durable Object counter.
 *
 * Hosted deployments run keyed providers on limited free plans. The per-client
 * rate limiter stops one abusive caller, but distributed traffic can still
 * burn a whole day's upstream quota — this is the last line of defense. One
 * global DO counts calls per provider per UTC day; a provider whose budget
 * (set in the `HOWISMYIP_DAILY_BUDGETS` table, e.g. `proxycheck:900`) is spent
 * is skipped for the rest of the day and reported as status "skipped", so the
 * UI/API stay transparent about what was and wasn't consulted.
 *
 * Everything FAILS OPEN: no budgets configured, no binding (plain Node dev),
 * or any DO error → no skips, the lookup runs in full.
 */

import type { DurableObjectState } from "cloudflare:workers";
import { enabledProviders, providerDailyBudget } from "@howismyip/core";

export const QUOTA_SKIP_REASON = "daily quota exhausted on this deployment";

interface ConsumeRequest {
	entries: Array<{ id: string; budget: number }>;
}

interface ConsumeResponse {
	exhausted: string[];
}

/**
 * Ids of enabled providers whose daily budget is already spent. Calling this
 * also consumes one call from each provider that still has budget, so invoke
 * it exactly once per uncached lookup.
 */
export async function quotaExhaustedProviders(): Promise<Set<string>> {
	const entries = enabledProviders(process.env)
		.map((p) => ({ id: p.id, budget: providerDailyBudget(p, process.env) }))
		.filter((e): e is { id: string; budget: number } => e.budget !== null);
	if (entries.length === 0) {
		return new Set();
	}
	try {
		const { env } = await import("cloudflare:workers");
		const namespace = env?.PROVIDER_QUOTA;
		if (!namespace) {
			return new Set(); // fail open when no binding (e.g. plain Node dev)
		}
		const stub = namespace.get(namespace.idFromName("global"));
		const res = await stub.fetch("https://provider-quota/consume", {
			method: "POST",
			body: JSON.stringify({ entries } satisfies ConsumeRequest),
		});
		if (!res.ok) {
			return new Set();
		}
		const { exhausted } = (await res.json()) as ConsumeResponse;
		return new Set(exhausted);
	} catch {
		return new Set(); // fail open on any error
	}
}

/**
 * The counter itself — exported to the runtime via `src/server-entry.ts` and
 * bound as `PROVIDER_QUOTA` in `wrangler.jsonc`. A single instance ("global")
 * holds one `count:<provider id>` key per provider for the current UTC day
 * plus a `day` marker; the first request of a new day wipes the old counts.
 * Durable Object input gates make the read-increment-write atomic per request.
 */
export class ProviderQuota {
	private readonly storage: DurableObjectState["storage"];

	constructor(state: DurableObjectState) {
		this.storage = state.storage;
	}

	async fetch(request: Request): Promise<Response> {
		const { entries } = (await request.json()) as ConsumeRequest;
		const day = new Date().toISOString().slice(0, 10);
		if ((await this.storage.get<string>("day")) !== day) {
			await this.storage.deleteAll();
			await this.storage.put("day", day);
		}
		const counts = await this.storage.get<number>(
			entries.map((e) => `count:${e.id}`),
		);
		const exhausted: string[] = [];
		const increments: Record<string, number> = {};
		for (const entry of entries) {
			const key = `count:${entry.id}`;
			const used = counts.get(key) ?? 0;
			if (used >= entry.budget) {
				exhausted.push(entry.id);
			} else {
				increments[key] = used + 1;
			}
		}
		if (Object.keys(increments).length > 0) {
			await this.storage.put(increments);
		}
		return Response.json({ exhausted } satisfies ConsumeResponse);
	}
}
