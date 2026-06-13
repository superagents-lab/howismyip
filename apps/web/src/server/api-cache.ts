/**
 * Edge response cache for the public IP-lookup API. Uses the Cloudflare Workers
 * Cache API (`caches.default`), which is also present under the local
 * `@cloudflare/vite-plugin` dev runtime. On runtimes without it (e.g. plain
 * Node) it transparently no-ops — the lookup still runs, just uncached.
 *
 * This is an ephemeral edge cache, not durable storage: nothing is persisted
 * beyond the TTL and it is per-edge-location.
 */

const CACHE_TTL_SECONDS = 300; // 5 min — IP intelligence is stable over minutes

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
	const store = (globalThis as unknown as {
		caches?: { default?: EdgeCache };
	}).caches;
	return store?.default ?? null;
}

/** Stable cache key for a normalized lookup target (e.g. an IP string). */
function cacheKey(target: string): Request {
	return new Request(
		`https://howismyip.internal/cache/lookup/${encodeURIComponent(target)}`,
	);
}

/**
 * Run `compute` (which produces a JSON Response) behind the edge cache, keyed by
 * `target`. On a hit, returns the stored response with `x-cache: HIT`. On a
 * miss, runs `compute`, stores a clone when the response status is OK, and
 * returns it with `x-cache: MISS`. Non-OK responses (4xx/5xx) are never cached.
 */
export async function withResponseCache(
	target: string,
	compute: () => Promise<Response>,
): Promise<Response> {
	const cache = edgeCache();
	if (!cache) {
		return compute();
	}
	const key = cacheKey(target);

	const hit = await cache.match(key);
	if (hit) {
		const res = new Response(hit.body, hit);
		res.headers.set("x-cache", "HIT");
		return res;
	}

	const fresh = await compute();
	if (fresh.ok) {
		const toStore = new Response(fresh.clone().body, fresh);
		toStore.headers.set(
			"cache-control",
			`public, max-age=${CACHE_TTL_SECONDS}`,
		);
		await cache.put(key, toStore);
	}
	const out = new Response(fresh.body, fresh);
	out.headers.set("x-cache", "MISS");
	return out;
}
