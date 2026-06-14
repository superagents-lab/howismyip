# Plan 003: Add a short-TTL edge cache to the public `GET /api/ip/:ip` endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dba0c33..HEAD -- apps/web/src/routes/api/ip.\$ip.tsx`
> If that file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `dba0c33`, 2026-06-14

## Why this matters

Every call to `GET /api/ip/:ip` fans out to 6–12 upstream providers live
(`lookupIp` runs them all concurrently — `packages/core/src/aggregate.ts`).
There is no caching, so two requests for the same IP one second apart do the
full fan-out twice. This wastes the deployment's shared upstream rate budget
(the keyless `ip-api.com` allows only ~45 req/min from the Worker's single
egress IP) and adds avoidable latency.

A short-TTL edge cache keyed on the IP collapses repeat lookups to a single
upstream fan-out per IP per TTL window. IP intelligence is stable over minutes,
so a 5-minute TTL is safe. This is an edge **response cache** — it does not
persist anything durable, so it stays consistent with the project's "stateless,
nothing is persisted" design (the README statement is about durable storage of
results, not about an ephemeral edge cache).

This plan scopes caching to the highest-volume, unambiguously-cacheable endpoint
(`/api/ip/:ip`, the single-IP lookup the CLI and agents hit). `/api/me` is
per-caller and is handled by plan 002; SSR server-function caching is a deferred
follow-up (see Maintenance notes).

## Current state

`apps/web/src/routes/api/ip.$ip.tsx` (entire file):
```tsx
import { InvalidIpError, lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/ip/:ip — the endpoint the CLI and agents call. */
export const Route = createFileRoute("/api/ip/$ip")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const report = await lookupIp(params.ip);
					return Response.json(report, { headers: CORS });
				} catch (err) {
					if (err instanceof InvalidIpError) {
						return Response.json(
							{ error: err.message },
							{ status: 400, headers: CORS },
						);
					}
					return Response.json(
						{ error: err instanceof Error ? err.message : "lookup failed" },
						{ status: 500, headers: CORS },
					);
				}
			},
		},
	},
});
```

Deployment facts (from `apps/web/wrangler.jsonc`): the app runs on **Cloudflare
Workers** with `nodejs_compat`, compat date `2025-09-02`. The Workers **Cache
API** (`caches.default`) is available in production and under the local
`@cloudflare/vite-plugin` dev runtime. It is NOT available in a plain Node
process, so the cache helper must degrade to a no-op there.

There is no existing caching helper. Server route handlers return standard
`Response` objects.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Install   | `pnpm install`                               | exit 0              |
| Build core | `pnpm --filter @howismyip/core build`       | exit 0              |
| Typecheck web | `pnpm --filter @howismyip/web typecheck`  | exit 0, no errors   |
| Lint web  | `pnpm --filter @howismyip/web lint`          | exit 0              |
| Build web | `pnpm --filter @howismyip/web build`         | exit 0              |
| Dev server | `pnpm dev` (after `pnpm build`)             | app on :3000        |

Run from the repo root. Build core before typechecking/building web.

## Scope

**In scope** (create/modify only these):
- `apps/web/src/server/api-cache.ts` (create) — the cache helper.
- `apps/web/src/routes/api/ip.$ip.tsx` (modify) — wrap the lookup in the helper.

**Out of scope** (do NOT touch):
- `apps/web/src/routes/api/me.tsx` — owned by plan 002; not cached here.
- The server functions in `apps/web/src/server/lookup.ts` (SSR path) — deferred.
- `packages/core` — caching is a Worker/edge concern; do not add caching into
  the runtime-agnostic core.
- `wrangler.jsonc` — the Cache API needs no binding/config.

## Git workflow

- Branch: `advisor/003-edge-cache-ip-lookup`
- Commit message e.g. `perf(web): short-TTL edge cache for /api/ip/:ip`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the cache helper

Create `apps/web/src/server/api-cache.ts` with exactly this content (it is
written so plan 004 can extend it):
```ts
/**
 * Edge response cache for the public IP-lookup API. Uses the Cloudflare Workers
 * Cache API (`caches.default`), which is also present under the local
 * `@cloudflare/vite-plugin` dev runtime. On runtimes without the Cache API
 * (e.g. plain Node) it transparently no-ops — the lookup still runs, uncached.
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
```

Notes for understanding (do not change the above):
- The Workers cache is reached via `globalThis` through a locally-declared
  `EdgeCache` interface (see `edgeCache()`), because this repo does not ship
  `@cloudflare/workers-types` and the ambient `caches` global is typed as the
  DOM `CacheStorage` (no `.default`). The `as unknown as { caches?... }` cast is
  a typed narrowing — do **not** replace it with `any`, and do **not** add
  `@cloudflare/workers-types` or edit `tsconfig.json` (out of scope).
- The synthetic key URL is never fetched; it is only an identity for the cache.

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0 (build core first
if needed).

### Step 2: Wire the helper into `/api/ip/:ip`

Edit `apps/web/src/routes/api/ip.$ip.tsx` to wrap the existing try/catch lookup
in `withResponseCache`, keyed on `params.ip`. Target shape:
```tsx
import { InvalidIpError, lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { withResponseCache } from "../../server/api-cache";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/ip/:ip — the endpoint the CLI and agents call. */
export const Route = createFileRoute("/api/ip/$ip")({
	server: {
		handlers: {
			GET: ({ params }) =>
				withResponseCache(params.ip, async () => {
					try {
						const report = await lookupIp(params.ip);
						return Response.json(report, { headers: CORS });
					} catch (err) {
						if (err instanceof InvalidIpError) {
							return Response.json(
								{ error: err.message },
								{ status: 400, headers: CORS },
							);
						}
						return Response.json(
							{ error: err instanceof Error ? err.message : "lookup failed" },
							{ status: 500, headers: CORS },
						);
					}
				}),
		},
	},
});
```
The error responses keep their 400/500 status and, because they are not OK, are
never stored — so an upstream blip is never cached.

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0.

### Step 3: Lint and build

**Verify**:
- `pnpm --filter @howismyip/web lint` → exit 0.
- `pnpm --filter @howismyip/web build` → exit 0.

### Step 4: Manual cache verification

Run the app (`pnpm build` then `pnpm dev`). Then:
```
curl -si http://localhost:3000/api/ip/8.8.8.8 | grep -i x-cache
curl -si http://localhost:3000/api/ip/8.8.8.8 | grep -i x-cache
```
Expected: the **first** response carries `x-cache: MISS`, the **second** (within
5 minutes) carries `x-cache: HIT`. The HIT response should be visibly faster and
identical in body.

If the local dev runtime does not expose `caches.default`, both will say
`MISS` (the no-op path). If that happens, note it and confirm via `wrangler dev`
if available (`cd apps/web && pnpm dlx wrangler dev`), otherwise rely on the
typecheck/build gates and report that local cache verification was not possible.

## Test plan

- The cache helper is exercised end-to-end by Step 4's curl check (MISS then
  HIT). A pure unit test is impractical without a Workers `caches` mock and the
  repo has no web test harness yet, so it is not required for this plan.
- Correctness of the *lookup itself* is unchanged and already covered by
  `packages/core` tests; this plan only adds a transparent caching wrapper.

## Done criteria

ALL must hold:

- [ ] `apps/web/src/server/api-cache.ts` exists and exports `withResponseCache`.
- [ ] `apps/web/src/routes/api/ip.$ip.tsx` wraps the lookup in `withResponseCache`
      (`grep -n "withResponseCache" apps/web/src/routes/api/ip.\$ip.tsx` matches).
- [ ] `pnpm --filter @howismyip/web typecheck` exits 0.
- [ ] `pnpm --filter @howismyip/web lint` exits 0.
- [ ] `pnpm --filter @howismyip/web build` exits 0.
- [ ] Step 4 shows `x-cache: MISS` then `x-cache: HIT` (or, if the local runtime
      lacks the Cache API, this is explicitly noted as not-verifiable locally).
- [ ] `git status` shows only the new `api-cache.ts` and modified `ip.$ip.tsx`.
- [ ] `plans/README.md` status row for plan 003 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt doesn't match the live `ip.$ip.tsx` (drift).
- The `edgeCache()` typed-narrowing helper as written still fails to typecheck.
  Report the exact error rather than scattering `any` casts or adding
  `@cloudflare/workers-types` / editing `tsconfig.json` (both out of scope) — a
  type approach that needs those is a decision worth surfacing, not guessing.
- `cache.put` throws at runtime in Step 4 (it rejects certain responses) — report
  the exact error; it may mean the synthetic GET key or headers need adjustment.
- Step 4 shows `x-cache: HIT` returning a *stale error* body — that should be
  impossible (errors aren't cached); if it happens, stop and report.

## Maintenance notes

- TTL is `CACHE_TTL_SECONDS = 300` in `api-cache.ts`. If providers' data becomes
  more volatile or you add per-request personalization, revisit it.
- **Plan 004 (rate limiting) extends this helper / endpoint.** It is designed to
  run after this plan and to call its rate-limit guard *before* `withResponseCache`
  so cached hits still count against limits as intended. Keep `withResponseCache`'s
  signature stable.
- Deferred follow-ups, intentionally out of scope here: (1) caching the SSR
  server-function path (`lookupIpFn`/`lookupSelfFn` in `lookup.ts`), which would
  need a data-level cache rather than a Response cache; (2) a `Cache-Control`
  header on the client-facing response for browser/CDN caching.
- A reviewer should confirm error responses are never stored (the `fresh.ok`
  guard) and that the success body is byte-identical between MISS and HIT.
