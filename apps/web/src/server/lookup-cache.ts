/**
 * The one lookup pipeline every entry point shares — the JSON API routes and
 * the UI's server functions all call `cachedLookup` so cache, quota, and
 * normalization behavior can't drift apart (and no path can bypass them):
 *
 *   normalize IP → edge cache → provider daily quota → full provider fan-out
 *
 * The cache is the Cloudflare Workers Cache API (`caches.default`), keyed by
 * the RFC 5952-normalized IP so textual variants of one address ("2001:DB8::1"
 * vs "2001:db8::1") share an entry instead of each burning a provider fan-out.
 * It is ephemeral and per-edge-location, not durable storage. On runtimes
 * without it (plain Node) it no-ops. Quota is only consulted — and consumed —
 * on a cache miss; see `provider-quota.ts`.
 */
import {
	InvalidIpError,
	type IpReport,
	lookupIp,
	normalizeIp,
} from "@howismyip/core";
import {
	buildLookupTelemetry,
	type LookupCacheStatus,
	type LookupEntrypoint,
	logLookupTelemetry,
} from "./lookup-observability.server";
import { QUOTA_SKIP_REASON, quotaExhaustedProviders } from "./provider-quota";

// Complete IP intelligence is stable over hours. Partial reports with a
// provider error get a short TTL so transient upstream failures can recover
// without making every refresh burn another full provider fan-out.
const CACHE_TTL_SECONDS = 21_600; // 6h
const PARTIAL_CACHE_TTL_SECONDS = 300; // 5m
// Bump whenever the serialized IpReport shape changes. Version 3 separates
// registry allocations from BGP announcements and replaces peer provenance
// facts with relationship summaries.
const CACHE_KEY_VERSION = 3;

export function cacheTtlSecondsForStatuses(
	statuses: Iterable<IpReport["sources"][number]["status"]>,
): number {
	for (const status of statuses) {
		if (status === "error") {
			return PARTIAL_CACHE_TTL_SECONDS;
		}
	}
	return CACHE_TTL_SECONDS;
}

/**
 * The slice of the Cloudflare Workers Cache API we use. Declared locally because
 * this project does NOT install `@cloudflare/workers-types` and pins
 * `apps/web/tsconfig.json` to `"types": ["vite/client"]`, so the ambient
 * `caches` global resolves to the DOM `CacheStorage` (which has no `.default`).
 * We reach the Workers cache through `globalThis` via `unknown` — a typed
 * narrowing, not `any`, and no new dependency or tsconfig change.
 */
interface EdgeCache {
	match(request: Request): Promise<Response | undefined>;
	put(request: Request, response: Response): Promise<void>;
}

/** The Workers default cache, or null on runtimes without it (e.g. plain Node). */
function edgeCache(): EdgeCache | null {
	const store = (
		globalThis as unknown as {
			caches?: { default?: EdgeCache };
		}
	).caches;
	return store?.default ?? null;
}

/** Stable cache key for a normalized IP. */
function cacheKey(ip: string): Request {
	return new Request(
		`https://howismyip.internal/cache/v${CACHE_KEY_VERSION}/lookup/${encodeURIComponent(ip)}`,
	);
}

export interface CachedLookup {
	report: IpReport;
	/** HIT = served from edge cache; MISS = computed and stored; BYPASS = no
	 *  cache on this runtime (e.g. plain Node dev). */
	cache: LookupCacheStatus;
}

function observeLookup(
	result: CachedLookup,
	startedAt: number,
	entrypoint: LookupEntrypoint,
): CachedLookup {
	logLookupTelemetry(
		buildLookupTelemetry(
			result.report,
			result.cache,
			Date.now() - startedAt,
			entrypoint,
		),
	);
	return result;
}

/** Providers whose daily budget is spent are skipped, not called. */
function computeReport(ip: string): Promise<IpReport> {
	return quotaExhaustedProviders().then((skipProviderIds) =>
		lookupIp(ip, process.env, {
			skipProviderIds,
			skipReason: QUOTA_SKIP_REASON,
		}),
	);
}

/**
 * Look up `rawIp` behind the edge cache. Throws `InvalidIpError` on garbage
 * input (before touching cache or quota). `lookupIp` absorbs per-provider
 * errors into partial reports, which are cached briefly instead of for 6h.
 */
export async function cachedLookup(
	rawIp: string,
	entrypoint: LookupEntrypoint = "unknown",
): Promise<CachedLookup> {
	const startedAt = Date.now();
	const ip = normalizeIp(rawIp);
	if (!ip) {
		throw new InvalidIpError(rawIp);
	}
	const cache = edgeCache();
	if (!cache) {
		return observeLookup(
			{ report: await computeReport(ip), cache: "BYPASS" },
			startedAt,
			entrypoint,
		);
	}
	const key = cacheKey(ip);

	const hit = await cache.match(key);
	if (hit) {
		return observeLookup(
			{ report: (await hit.json()) as IpReport, cache: "HIT" },
			startedAt,
			entrypoint,
		);
	}

	const report = await computeReport(ip);
	const ttl = cacheTtlSecondsForStatuses(
		report.sources.map((source) => source.status),
	);
	await cache.put(
		key,
		Response.json(report, {
			headers: { "cache-control": `public, max-age=${ttl}` },
		}),
	);
	return observeLookup({ report, cache: "MISS" }, startedAt, entrypoint);
}
