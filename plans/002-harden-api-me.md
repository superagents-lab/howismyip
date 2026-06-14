# Plan 002: Harden `/api/me` to validate the detected IP and stop 500-ing on spoofed headers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dba0c33..HEAD -- apps/web/src/routes/api/me.tsx apps/web/src/server/lookup.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `dba0c33`, 2026-06-14

## Why this matters

The project has two "look up my own IP" code paths that have drifted apart:

- The **server function** `lookupSelfFn` (used by the web UI) carefully
  validates the detected IP, rejects private/reserved addresses, and falls back
  to egress detection — so it always returns a real public IP or a clean
  `reason`.
- The **public JSON API** `GET /api/me` (used by the CLI and agents) does none
  of that: it passes whatever `detectClientIp()` returns straight into
  `lookupIp`. `detectClientIp()` reads client-controllable headers
  (`x-real-ip`, `x-forwarded-for`). A request with `x-real-ip: not-an-ip`
  makes `lookupIp` throw `InvalidIpError`, which is **not caught**, producing a
  generic 500 and leaking the error message. A LAN/loopback address (`::1` in
  local dev) is looked up as if public.

This is a correctness + robustness gap on a public endpoint. The fix makes
`/api/me` behave like `lookupSelfFn`: validate, filter private, fall back to
egress, and translate failures into proper status codes.

## Current state

`apps/web/src/routes/api/me.tsx` (entire file, lines 1-25):
```tsx
import { lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { detectClientIp } from "../../server/client-ip.server";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/me — looks up the caller's own (public) IP. */
export const Route = createFileRoute("/api/me")({
	server: {
		handlers: {
			GET: async () => {
				const ip = await detectClientIp();
				if (!ip) {
					return Response.json(
						{ error: "could not determine client IP" },
						{ status: 422, headers: CORS },
					);
				}
				const report = await lookupIp(ip);   // <-- can throw InvalidIpError → unhandled 500
				return Response.json(report, { headers: CORS });
			},
		},
	},
});
```

The reference behavior to mirror — `apps/web/src/server/lookup.ts:41-85`:
```ts
/** Our egress IP via a public echo service — the fallback when request headers
 *  don't carry a usable public IP (local dev, missing proxy headers). */
async function fetchEgressIp(): Promise<string | null> {
	try {
		const res = await fetch("https://api.ipify.org?format=json");
		if (!res.ok) return null;
		const data = (await res.json()) as { ip?: string };
		return data.ip && isValidIp(data.ip) ? data.ip : null;
	} catch {
		return null;
	}
}

export const lookupSelfFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<SelfLookup> => {
		const headerIp = await detectClientIp();
		let ip =
			headerIp && isValidIp(headerIp) && !isPrivateOrReserved(headerIp)
				? headerIp
				: null;
		if (!ip) ip = await fetchEgressIp();
		// ...
	},
);
```

Note `fetchEgressIp` is currently a **non-exported** function in `lookup.ts`.
`isValidIp` and `isPrivateOrReserved` are exported from `@howismyip/core`
(they are already imported in `lookup.ts:1-10`).

This plan reuses `fetchEgressIp` rather than duplicating it (the repo values a
single source of truth — see the README "one source of truth" note).

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Install   | `pnpm install`                               | exit 0              |
| Build core | `pnpm --filter @howismyip/core build`       | exit 0 (web imports core from dist) |
| Typecheck web | `pnpm --filter @howismyip/web typecheck`  | exit 0, no errors   |
| Lint web  | `pnpm --filter @howismyip/web lint`          | exit 0 (biome)      |
| Build web | `pnpm --filter @howismyip/web build`         | exit 0              |

Run from the repo root. Build core **before** typechecking web — the web app
imports `@howismyip/core` from its built `dist/`.

## Scope

**In scope** (modify only these):
- `apps/web/src/server/lookup.ts` — export `fetchEgressIp` (change one keyword).
- `apps/web/src/routes/api/me.tsx` — add validation, private-IP filter, egress
  fallback, and a try/catch.

**Out of scope** (do NOT touch):
- `apps/web/src/server/client-ip.server.ts` — the header-precedence order is
  intentional (`cf-connecting-ip` first is the trustworthy Cloudflare header).
- `lookupSelfFn` / `lookupIpFn` themselves — only the export keyword on
  `fetchEgressIp` changes.
- The response shape on success — clients consume the `IpReport` JSON; keep it
  identical (still `Response.json(report, { headers: CORS })`).

## Git workflow

- Branch: `advisor/002-harden-api-me`
- Commit message e.g. `fix(web): validate detected IP in /api/me, mirror lookupSelfFn`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export `fetchEgressIp` from `lookup.ts`

In `apps/web/src/server/lookup.ts`, change the declaration:
```ts
async function fetchEgressIp(): Promise<string | null> {
```
to:
```ts
export async function fetchEgressIp(): Promise<string | null> {
```
Change nothing else in this file.

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0 (after building
core in the next-needed order; if core isn't built yet run
`pnpm --filter @howismyip/core build` first).

### Step 2: Rewrite the `/api/me` handler

Replace the body of `apps/web/src/routes/api/me.tsx` so the handler:
1. detects the header IP,
2. accepts it only if `isValidIp(headerIp) && !isPrivateOrReserved(headerIp)`,
3. otherwise falls back to `fetchEgressIp()`,
4. returns `422` if still no usable public IP,
5. wraps `lookupIp(ip)` in try/catch and returns `500` with the error message
   on failure.

Target shape (imports + handler):
```tsx
import { isPrivateOrReserved, isValidIp, lookupIp } from "@howismyip/core";
import { createFileRoute } from "@tanstack/react-router";
import { detectClientIp } from "../../server/client-ip.server";
import { fetchEgressIp } from "../../server/lookup";

const CORS = { "access-control-allow-origin": "*" } as const;

/** Public JSON API: GET /api/me — looks up the caller's own (public) IP. */
export const Route = createFileRoute("/api/me")({
	server: {
		handlers: {
			GET: async () => {
				const headerIp = await detectClientIp();
				let ip =
					headerIp && isValidIp(headerIp) && !isPrivateOrReserved(headerIp)
						? headerIp
						: null;
				if (!ip) {
					ip = await fetchEgressIp();
				}
				if (!ip) {
					return Response.json(
						{ error: "could not determine a public client IP" },
						{ status: 422, headers: CORS },
					);
				}
				try {
					const report = await lookupIp(ip);
					return Response.json(report, { headers: CORS });
				} catch (err) {
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

Note: importing `fetchEgressIp` from `../../server/lookup` pulls a module that
also exports server functions; that is fine — both run server-side only and the
TanStack Start build keeps them out of the client bundle (the same `lookup.ts`
is already server-only).

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0, no errors.

### Step 3: Lint and build

**Verify**:
- `pnpm --filter @howismyip/web lint` → exit 0.
- `pnpm --filter @howismyip/web build` → exit 0.

### Step 4: Manual smoke test (optional but recommended)

If you can run the dev server (`pnpm build` then `pnpm dev`, app at
`http://localhost:3000`):
- `curl -s http://localhost:3000/api/me` → returns an `IpReport` JSON (in local
  dev this exercises the egress fallback, since headers give `::1`).
- `curl -s -H 'x-real-ip: not-an-ip' http://localhost:3000/api/me` → still
  returns a valid `IpReport` (egress fallback kicks in) **or** a clean `422`
  JSON — never an unhandled 500 / HTML error page.

If you cannot run the server in this environment, skip Step 4 and note it.

## Test plan

There is no existing test harness for the web route handlers (web `test` script
is `vitest run --passWithNoTests`), and standing one up for raw TanStack route
handlers is out of scope for this S-sized fix. Verification is therefore:
typecheck + lint + build (Steps 1-3) and the optional manual smoke test (Step 4).

If you want to add a regression test and a vitest setup already exists by the
time you execute this, prefer a unit test of a small extracted helper over
mounting the route — but do not expand scope to build test infrastructure here.

## Done criteria

ALL must hold:

- [ ] `pnpm --filter @howismyip/web typecheck` exits 0.
- [ ] `pnpm --filter @howismyip/web lint` exits 0.
- [ ] `pnpm --filter @howismyip/web build` exits 0.
- [ ] `fetchEgressIp` is exported from `lookup.ts` and imported by `me.tsx`
      (`grep -n "fetchEgressIp" apps/web/src/server/lookup.ts apps/web/src/routes/api/me.tsx`
      shows the export and the import).
- [ ] `/api/me` calls `lookupIp` inside a try/catch
      (`grep -n "catch" apps/web/src/routes/api/me.tsx` returns a match).
- [ ] `git status` shows only `lookup.ts` and `me.tsx` modified.
- [ ] `plans/README.md` status row for plan 002 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live files (drift since `dba0c33`).
- `fetchEgressIp` no longer exists in `lookup.ts` (it was renamed/removed).
- Importing from `../../server/lookup` into the route handler causes a
  client-bundle error at build time (Step 3 build fails complaining that
  server-only code reached the client) — report it; the fix would be to move
  `fetchEgressIp` into `client-ip.server.ts` or a new `*.server.ts` module
  instead, which changes the scope.

## Maintenance notes

- `/api/me` and `lookupSelfFn` now share `fetchEgressIp` and the same
  validate→filter→fallback logic. If that logic changes again, change both — or,
  as a deferred follow-up, extract a single `resolveSelfIp()` used by both. That
  refactor was intentionally left out here to keep this fix small and low-risk.
- The egress fallback makes an outbound call to `api.ipify.org`; if that
  dependency is ever removed, `/api/me` falls back to the `422` path, which is
  acceptable.
- A reviewer should confirm the success response shape is unchanged (still the
  raw `IpReport`) so existing CLI/agent consumers don't break.
