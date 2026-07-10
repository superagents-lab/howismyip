/**
 * Per-provider call budgets, enforced by a Durable Object counter.
 *
 * Hosted deployments run keyed providers on limited free plans. The per-client
 * rate limiter stops one abusive caller, but distributed traffic can still
 * burn a whole quota period's upstream calls — this is the last line of
 * defense. One global DO counts calls per provider, reset according to that
 * provider's own real-world billing cycle (`IpProvider.billingPeriod`: `'day'`
 * by default, `'month'` for providers metered monthly, `'lifetime'` for
 * prepaid balances that never refill on their own, e.g. MaxMind). A provider
 * whose budget (set in the `HOWISMYIP_DAILY_BUDGETS` table, e.g.
 * `proxycheck:900`) is spent for its current period is skipped for the rest
 * of it and reported as status "skipped", so the UI/API stay transparent
 * about what was and wasn't consulted.
 *
 * Everything FAILS OPEN: no budgets configured, no binding (plain Node dev),
 * or any DO error → no skips, the lookup runs in full.
 */

import type { DurableObjectState } from "cloudflare:workers";
import {
	enabledProviders,
	type IpProvider,
	providerDailyBudget,
} from "@howismyip/core";

export const QUOTA_SKIP_REASON = "quota exhausted on this deployment";

type BillingPeriod = NonNullable<IpProvider["billingPeriod"]>;

interface ConsumeRequest {
	entries: Array<{ id: string; budget: number; period: BillingPeriod }>;
}

interface ConsumeResponse {
	exhausted: string[];
}

/**
 * Ids of enabled providers whose budget for their current period is already
 * spent. Calling this also consumes one call from each provider that still
 * has budget, so invoke it exactly once per uncached lookup.
 */
export async function quotaExhaustedProviders(): Promise<Set<string>> {
	const entries = enabledProviders(process.env)
		.map((p) => ({
			id: p.id,
			budget: providerDailyBudget(p, process.env),
			period: p.billingPeriod ?? "day",
		}))
		.filter(
			(e): e is { id: string; budget: number; period: BillingPeriod } =>
				e.budget !== null,
		);
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

/** The bucket label a period resets on: a UTC calendar day, a UTC calendar
 *  month, or (for 'lifetime') a constant that never changes. */
function periodLabel(period: BillingPeriod, now: string): string {
	if (period === "day") {
		return now.slice(0, 10); // YYYY-MM-DD
	}
	if (period === "month") {
		return now.slice(0, 7); // YYYY-MM
	}
	return "lifetime";
}

/**
 * The counter itself — exported to the runtime via `src/server-entry.ts` and
 * bound as `PROVIDER_QUOTA` in `wrangler.jsonc`. A single instance ("global")
 * holds, per provider id, a `count:<id>` (calls used this period) and a
 * `period:<id>` (which period bucket that count belongs to, e.g. "2026-07-10"
 * for a daily provider or "2026-07" for a monthly one). When a provider's
 * current bucket differs from its stored one — including the first request
 * after a deploy, when no `period:<id>` exists yet — that provider's count
 * resets to zero before the budget check. `'lifetime'` providers always
 * compute the same bucket, so they never reset: raise their configured budget
 * after a real-world top-up instead. Durable Object input gates make the
 * read-check-write atomic per request.
 */
export class ProviderQuota {
	private readonly storage: DurableObjectState["storage"];

	constructor(state: DurableObjectState) {
		this.storage = state.storage;
	}

	async fetch(request: Request): Promise<Response> {
		const { entries } = (await request.json()) as ConsumeRequest;
		const now = new Date().toISOString();
		const stored = await this.storage.get<string | number>(
			entries.flatMap((e) => [`count:${e.id}`, `period:${e.id}`]),
		);

		const exhausted: string[] = [];
		const writes: Record<string, string | number> = {};
		for (const entry of entries) {
			const currentBucket = periodLabel(entry.period, now);
			const storedBucket = stored.get(`period:${entry.id}`);
			const used =
				storedBucket === currentBucket
					? ((stored.get(`count:${entry.id}`) as number | undefined) ?? 0)
					: 0;
			if (used >= entry.budget) {
				exhausted.push(entry.id);
			} else {
				writes[`count:${entry.id}`] = used + 1;
				if (storedBucket !== currentBucket) {
					writes[`period:${entry.id}`] = currentBucket;
				}
			}
		}
		if (Object.keys(writes).length > 0) {
			await this.storage.put(writes);
		}
		return Response.json({ exhausted } satisfies ConsumeResponse);
	}
}
