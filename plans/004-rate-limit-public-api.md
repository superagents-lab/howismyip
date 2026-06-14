# Plan 004: Rate-limit the public IP-lookup API to protect upstream quotas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. This plan has a deliberate **investigation step
> first** (Step 1) because one integration detail (how a Worker binding is
> reached from a TanStack Start route handler) must be confirmed in-repo before
> the code is written. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dba0c33..HEAD -- apps/web/src/routes/api apps/web/wrangler.jsonc`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the request path of both public API endpoints; an
  over-aggressive limit would reject legitimate traffic)
- **Depends on**: plans/002-harden-api-me.md, plans/003-edge-cache-ip-lookup.md
- **Category**: security
- **Planned at**: commit `dba0c33`, 2026-06-14

## Why this matters

The public API (`GET /api/ip/:ip`, `GET /api/me`) is unauthenticated, CORS-open
(`access-control-allow-origin: *`), and each call fans out to 6–12 upstream
providers. The keyless `ip-api.com` allows only ~45 req/min from a single egress
IP (the Worker's), and the optional paid providers (AbuseIPDB, IPQS, ipdata,
etc.) bill per request against the operator's quota. Without a rate limit, any
client can:

- drain the shared keyless budget, breaking lookups for **all** users, and
- burn the operator's paid-provider quota / money.

Plan 003's edge cache reduces *duplicate* upstream load, but does nothing against
an attacker spraying many distinct IPs. A per-client rate limit is the missing
control. This plan adds one in front of both public endpoints.

## Current state

After plans 002 and 003 land, the two handlers look like this (confirm against
the live files during the drift check — these reflect the post-002/003 state):

- `apps/web/src/routes/api/ip.$ip.tsx` — `GET: ({ params }) => withResponseCache(params.ip, async () => { ... })`
- `apps/web/src/routes/api/me.tsx` — `GET: async () => { ... detectClientIp ... lookupIp ... }`

Deployment: **Cloudflare Workers**, `apps/web/wrangler.jsonc`:
```jsonc
{
  "name": "howismyip",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "workers_dev": true,
  "observability": { "enabled": true },
  "routes": [{ "pattern": "howismyip.xyz", "custom_domain": true }]
}
```

Cloudflare provides a native **Rate Limiting binding** (`unsafe`/simple rate
limiter) configured in `wrangler.jsonc` and called as
`env.<NAME>.limit({ key })`. The open question this plan must resolve first:
**how does a TanStack Start raw route handler obtain the Cloudflare `env`
(bindings) object?** The repo already reaches request data via
`@tanstack/react-start/server` helpers (`getRequestHeaders`, `getRequestIP` in
`apps/web/src/server/client-ip.server.ts`); the Worker `env`/bindings may be
reachable similarly (e.g. `getEvent()` / a Cloudflare context helper) or via the
`cloudflare:workers` `env` import exposed by `@cloudflare/vite-plugin`. Step 1
determines which.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Install   | `pnpm install`                               | exit 0              |
| Build core | `pnpm --filter @howismyip/core build`       | exit 0              |
| Typecheck web | `pnpm --filter @howismyip/web typecheck`  | exit 0, no errors   |
| Lint web  | `pnpm --filter @howismyip/web lint`          | exit 0              |
| Build web | `pnpm --filter @howismyip/web build`         | exit 0              |
| Wrangler dev (real bindings) | `cd apps/web && pnpm dlx wrangler dev` | local Worker on a port |

## Scope

**In scope** (create/modify only these):
- `apps/web/wrangler.jsonc` — add the rate-limiter binding.
- `apps/web/src/server/rate-limit.server.ts` (create) — the guard helper.
- `apps/web/src/routes/api/ip.$ip.tsx` (modify) — call the guard first.
- `apps/web/src/routes/api/me.tsx` (modify) — call the guard first.
- `apps/web/worker-configuration.d.ts` or equivalent env type, **only if** Step 1
  shows a generated types file is the right place for the binding type.

**Out of scope** (do NOT touch):
- `packages/core` — rate limiting is an edge concern.
- `withResponseCache` in `api-cache.ts` — the guard runs *before* it; do not
  fold rate limiting into the cache helper.
- The success response shapes.

## Git workflow

- Branch: `advisor/004-rate-limit-public-api`
- Commit message e.g. `feat(web): per-client rate limit on public IP API`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (INVESTIGATION — do this before writing any guard code)

Determine how to reach the Cloudflare `env` bindings from a route handler.

1. Read `apps/web/src/server/client-ip.server.ts` to see the existing
   `@tanstack/react-start/server` import pattern.
2. Search the installed TanStack Start server entry for a bindings/context
   accessor:
   ```
   grep -rn "getEvent\|cloudflare\|context\|getBindings\|env" \
     apps/web/node_modules/@tanstack/react-start/dist 2>/dev/null | head -40
   ```
3. Check whether `@cloudflare/vite-plugin` exposes an `env` import:
   ```
   grep -rn "cloudflare:workers\|getPlatformProxy\|env" \
     apps/web/node_modules/@cloudflare/vite-plugin/dist 2>/dev/null | head -20
   ```
4. Read the Cloudflare Rate Limiting binding docs reference (the `ratelimits`
   key in `wrangler.jsonc` and the `.limit({ key })` API).

**Decision gate**: pick ONE of:
- **(A) Binding reachable** — you found a supported way to get `env` (or the
  rate-limiter binding directly) inside a handler. Proceed to Step 2A.
- **(B) Binding NOT cleanly reachable** — there is no first-class way to read
  the binding from a raw route handler without hacks. **STOP and report**, and
  recommend the no-code fallback in "Fallback" below instead of writing fragile
  code. Do not force it with global/`any` hacks.

Write one or two sentences in your report stating which path you took and the
exact accessor you will use.

### Step 2A: Add the rate-limiter binding to `wrangler.jsonc`

Add a `ratelimits` entry (a simple sliding-window limiter; tune the numbers
conservatively — start generous to avoid blocking real agents/CLI users):
```jsonc
"ratelimits": [
  {
    "name": "API_RATE_LIMITER",
    "namespace_id": "1001",
    "simple": { "limit": 60, "period": 60 }
  }
]
```
(60 requests / 60 seconds per key. Adjust only with a stated reason.)

**Verify**: `cd apps/web && pnpm dlx wrangler dev` starts without a config error
(Ctrl-C to stop). If wrangler is unavailable in this environment, at minimum
confirm the JSON is valid and `pnpm --filter @howismyip/web build` still exits 0.

### Step 2B: Create the guard helper

Create `apps/web/src/server/rate-limit.server.ts`. It must:
- read the client key (prefer `cf-connecting-ip`, then `x-real-ip`, then a
  constant fallback `"anon"`) using the same header source the repo already uses
  (reuse `detectClientIp` from `client-ip.server.ts`, or the
  `@tanstack/react-start/server` header helper — match what Step 1 found),
- call the binding from Step 1 (`<env>.API_RATE_LIMITER.limit({ key })`),
- return `null` when allowed, or a ready-to-send `429` `Response` (with the CORS
  header `access-control-allow-origin: *` and a JSON body
  `{ error: "rate limited" }`) when denied,
- **fail open**: if the binding is unavailable (local Node dev, or any error),
  return `null` (allow) — never let the limiter itself break the API.

Target shape (adapt the `env` access to Step 1's finding):
```ts
const CORS = { "access-control-allow-origin": "*" } as const;

/** Returns a 429 Response when the caller is over the limit, else null. */
export async function rateLimitGuard(): Promise<Response | null> {
	try {
		const limiter = /* env binding obtained per Step 1 */ undefined as
			| { limit(opts: { key: string }): Promise<{ success: boolean }> }
			| undefined;
		if (!limiter) {
			return null; // fail open when no binding (e.g. local Node dev)
		}
		const key = /* client IP key per Step 1, fallback "anon" */ "anon";
		const { success } = await limiter.limit({ key });
		if (success) {
			return null;
		}
		return Response.json(
			{ error: "rate limited" },
			{ status: 429, headers: CORS },
		);
	} catch {
		return null; // fail open on any limiter error
	}
}
```

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0.

### Step 3: Call the guard first in both handlers

In `apps/web/src/routes/api/ip.$ip.tsx`, make the handler `async` and check the
guard before the cached lookup:
```tsx
GET: async ({ params }) => {
	const limited = await rateLimitGuard();
	if (limited) {
		return limited;
	}
	return withResponseCache(params.ip, async () => {
		/* ...unchanged lookup body... */
	});
},
```

In `apps/web/src/routes/api/me.tsx`, add the same two-line guard as the first
statements inside the `GET` handler (before `detectClientIp()`).

Import `rateLimitGuard` from `../../server/rate-limit.server` in both files.

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0.

### Step 4: Lint and build

**Verify**:
- `pnpm --filter @howismyip/web lint` → exit 0.
- `pnpm --filter @howismyip/web build` → exit 0.

### Step 5: Behavioral verification

Preferred (real bindings): `cd apps/web && pnpm dlx wrangler dev`, then in
another shell hammer the endpoint past the limit:
```
for i in $(seq 1 70); do \
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/api/ip/8.8.8.8; \
done | sort | uniq -c
```
Expected: a mix of `200` (first ~60) and `429` (the rest) within the 60s window.

If wrangler/bindings are unavailable here, the limiter fails open (all `200`).
Record that behavioral verification requires a Workers runtime and was deferred
to deploy, and rely on typecheck/lint/build for this run.

### Fallback (if Step 1 hit decision (B))

If the binding cannot be cleanly reached from a route handler, do **not** ship
fragile code. Instead, report and recommend the no-code path:
- Configure a Cloudflare **WAF Rate Limiting rule** in the dashboard for the
  `howismyip.xyz` zone, matching `URI Path starts with /api/` with a threshold
  (e.g. 60 req / 1 min per client IP), action **Block** with a custom 429
  response. This needs zero code changes and is the recommended option when the
  binding integration is awkward. Leave `wrangler.jsonc` and the handlers
  unchanged, mark this plan BLOCKED in the index with the reason, and hand the
  dashboard recommendation to the operator.

## Test plan

- No unit tests: the limiter only does meaningful work inside the Workers
  runtime (the binding is a platform object), and the repo has no Workers test
  harness. Verification is the typecheck/lint/build gates plus the Step 5
  runtime check under `wrangler dev`.
- Confirm fail-open: in plain Node dev (`pnpm dev`), all requests return `200`
  (the guard returns `null` when no binding) — this proves the limiter can never
  take the API down on a runtime without the binding.

## Done criteria

ALL must hold (path A):

- [ ] `apps/web/wrangler.jsonc` has a `ratelimits` entry and remains valid JSON.
- [ ] `apps/web/src/server/rate-limit.server.ts` exists and exports
      `rateLimitGuard`, which fails open on missing binding / error.
- [ ] Both `api/ip.$ip.tsx` and `api/me.tsx` call `rateLimitGuard()` as their
      first step (`grep -rn "rateLimitGuard" apps/web/src/routes/api`).
- [ ] `pnpm --filter @howismyip/web typecheck` / `lint` / `build` all exit 0.
- [ ] Step 5 shows a `200`→`429` transition under `wrangler dev` (or this is
      explicitly recorded as deferred-to-deploy when no Workers runtime is
      available).
- [ ] `git status` shows only the in-scope files changed.
- [ ] `plans/README.md` status row for plan 004 updated.

If path B (fallback): the index row is marked BLOCKED with the WAF-rule
recommendation, and no code is changed.

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 reaches decision (B) — report and recommend the WAF fallback.
- Reaching `env` requires a global mutation, `any` cast of the whole module, or
  importing server internals not meant to be imported.
- After wiring, `pnpm dev` (plain Node) returns anything other than `200` for a
  single request — the guard is NOT failing open and could take down the API.
- The chosen `simple.limit`/`period` values would block normal CLI/agent usage
  (e.g. an agent vetting a batch of IPs) — surface the number for the operator to
  confirm rather than guessing.

## Maintenance notes

- The limit (60/60s) is a starting point; watch `observability` logs after
  deploy and tune. Document any change in the commit message.
- Keying on `cf-connecting-ip` means clients behind a shared NAT share a bucket;
  acceptable for abuse protection but note it if false-positive reports appear.
- The guard runs **before** `withResponseCache` (plan 003) by design, so cached
  hits still count toward the limit. If that ordering is ever reversed, attackers
  could bypass the limit on hot IPs.
- This protects against volumetric abuse, not distributed/botnet abuse; for that,
  layer Cloudflare WAF/Bot Management at the zone level (operator decision).
