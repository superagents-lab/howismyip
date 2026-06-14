# Plan 001: Cover the provider normalization parsers with unit tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dba0c33..HEAD -- packages/core/src/providers`
> If any provider source file changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `dba0c33`, 2026-06-14

## Why this matters

`packages/core` is the heart of this project: each provider adapter normalizes
one upstream API's quirky JSON into the shared `IpIntelligence` shape, and the
quality of that normalization *is* the product. Today only the generic helpers
(`helpers.ts`), IP parsing (`ip.ts`), and the aggregator (`aggregate.ts`) have
tests. The twelve provider adapters — including genuinely subtle logic — have
**zero** coverage:

- DNSBL treats `127.0.0.x` as "listed" but must *exclude* `127.255.255.x`
  (those are resolver-rejection sentinels, not listings) — a wrong boundary here
  produces false "this IP is on a blocklist" verdicts.
- Team Cymru parses pipe-delimited TXT records into ASN / prefix / registry.
- RDAP recursively walks nested entities and jCard (`vcardArray`) structures to
  find the abuse contact, and infers the RIR from link hosts.

When an upstream subtly changes its response shape, these parsers fail silently
and the service reports wrong intelligence with no alarm. This plan adds a
regression safety net so later refactors (and upstream drift) are caught.

## Current state

The providers live in `packages/core/src/providers/`. They are framework-free
and call two network helpers from `helpers.ts`:

- `fetchJson(url, init?)` — does `fetch`, throws on non-2xx, returns parsed JSON.
- `dohResolve(name, type)` — does `fetch` to Cloudflare DoH, returns an array of
  record-data strings; **never throws** (returns `[]` on error).

Both call the global `fetch`. The providers do **not** take an injected fetch,
so tests mock `globalThis.fetch`.

Key excerpts the tests will pin down:

`packages/core/src/providers/dnsbl.ts:21-26` — the listing boundary:
```ts
async function isListed(query: string): Promise<boolean> {
  const answers = await dohResolve(query, 'A');
  return answers.some(
    (a) => a.startsWith('127.') && !a.startsWith('127.255.255.')
  );
}
```
and `dnsbl.ts:46-58` — score is `min(100, hits * 40)`, with `ZONES` =
`Spamhaus`, `SpamCop`, `DroneBL`, `s5h.net`. IPv6 returns `null` early
(`detectIpVersion(ip) !== 4`).

`packages/core/src/providers/cymru.ts:45-77` — origin TXT record is
`"ASN | BGP Prefix | CC | Registry | Allocated"`; it then does a *second* TXT
lookup `AS<asn>.asn.cymru.com` whose 5th field (`parts[4]`) is the AS name.
Output: `asn` becomes `"AS" + number`, `rir` is upper-cased, `organization`
and `isp` are both the AS name.

`packages/core/src/providers/ip-api.ts:26-74` — `parseAsn` extracts the
`AS15169` token from the combined `as` field via `/^AS\d+/i`; returns `null`
unless `payload.status === 'success'`; `proxy_type` is `'Hosting'` when
`hosting` is truthy else `null`.

`packages/core/src/providers/rdap.ts` — `findAbuseContact` recurses
`entity.entities`, matching an entity whose `roles` includes `'abuse'`, then
pulls the first `email` field out of `vcardArray[1]`; `inferRir` matches
`arin|ripe|apnic|lacnic|afrinic` (in that order) across `port43` + link hrefs;
`cidr` reads `cidr0_cidrs[0]` → `"<v4prefix|v6prefix>/<length>"`.

### Repo test conventions — match these exactly

Tests use the **Node built-in test runner** (`node:test` + `node:assert/strict`),
run via `node --import tsx --test "src/**/*.test.ts"`. Imports use the `.js`
extension (TypeScript ESM convention) even for `.ts` files. Test files sit
next to the code they test as `<name>.test.ts`.

Model new tests structurally on `packages/core/src/providers/helpers.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asDict, first, toInt, toStr, yesNoToBool } from './helpers.js';

test('yesNoToBool', () => {
  assert.equal(yesNoToBool('yes'), true);
  // ...
});
```

There is **no existing fetch-mocking helper in the repo** — you will create a
tiny one inside each test file (see Step 1).

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Install   | `pnpm install`                                   | exit 0              |
| Run core tests | `pnpm --filter @howismyip/core test`        | all pass            |
| Typecheck | `pnpm --filter @howismyip/core typecheck`        | exit 0, no errors   |
| Lint/format | `pnpm check`                                   | exit 0 (biome)      |

Run all commands from the repo root (`/Users/wangding/Products/howismyip`).

## Scope

**In scope** (create these files only):
- `packages/core/src/providers/dnsbl.test.ts` (create)
- `packages/core/src/providers/cymru.test.ts` (create)
- `packages/core/src/providers/ip-api.test.ts` (create)
- `packages/core/src/providers/rdap.test.ts` (create)

**Out of scope** (do NOT modify):
- Any provider source file (`*.ts` that is not `*.test.ts`). If a test reveals a
  real bug in a provider, STOP and report it — do not "fix" the provider as part
  of this plan. The point of this plan is to characterize current behavior.
- `helpers.ts` / the network helpers — do not add a fetch-injection parameter;
  mock `globalThis.fetch` instead.

## Git workflow

- Branch: `advisor/001-provider-parser-tests`
- Commit message style follows the repo's conventional-commit history (e.g.
  `git log` shows `chore(web): ...`). Use e.g.
  `test(core): cover dnsbl/cymru/ip-api/rdap parsers`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `dnsbl.test.ts` with a fetch mock

The DNSBL provider calls `dohResolve(query, 'A')`, which fetches
`https://cloudflare-dns.com/dns-query?name=...&type=A` and reads `body.Answer`
(an array of `{ type, data }`, where A records have `type === 1`).

Create `packages/core/src/providers/dnsbl.test.ts` that:

1. Defines a fetch mock that inspects the requested URL's `name=` query param and
   returns a DoH-shaped JSON `Response`. Use this shape:
   ```ts
   import assert from 'node:assert/strict';
   import { afterEach, test } from 'node:test';
   import { dnsblProvider } from './dnsbl.js';

   const realFetch = globalThis.fetch;
   afterEach(() => { globalThis.fetch = realFetch; });

   /** Map of DNS query name -> A-record data strings the mock should return. */
   function mockDoh(answers: Record<string, string[]>) {
     globalThis.fetch = ((input: string | URL | Request) => {
       const url = new URL(typeof input === 'string' ? input : input.toString());
       const name = url.searchParams.get('name') ?? '';
       const data = answers[name] ?? [];
       const body = { Answer: data.map((d) => ({ type: 1, data: d })) };
       return Promise.resolve(
         new Response(JSON.stringify(body), { status: 200 })
       );
     }) as typeof fetch;
   }
   ```
2. Tests to write (assert against `dnsblProvider.lookup('1.2.3.4', {})`; note the
   reversed query label for `1.2.3.4` is `4.3.2.1`):
   - **Clean IP**: all zones return `[]` → result `blocklists` is `[]`,
     `risk_score` is `0`, `risk_level` is `'low'`.
   - **Listed on one zone**: `4.3.2.1.zen.spamhaus.org` returns `['127.0.0.2']`,
     others `[]` → `blocklists` equals `['Spamhaus']`, `risk_score` is `40`.
   - **Resolver-rejection sentinel is NOT a listing**: a zone returns
     `['127.255.255.254']` → that zone is absent from `blocklists` (this is the
     critical boundary; assert `blocklists` is `[]`).
   - **Score caps at 100**: list the IP on all four zones (`['127.0.0.2']` each)
     → `risk_score` is `100` (not `160`), `risk_level` is `'high'`.
   - **IPv6 short-circuits**: `dnsblProvider.lookup('2001:4860:4860::8888', {})`
     resolves to `null` (no fetch needed).

   The four zone names to key the mock by (label `4.3.2.1` + zone):
   `4.3.2.1.zen.spamhaus.org`, `4.3.2.1.bl.spamcop.net`,
   `4.3.2.1.dnsbl.dronebl.org`, `4.3.2.1.all.s5h.net`.

**Verify**: `pnpm --filter @howismyip/core test` → all tests pass, including the
new dnsbl tests.

### Step 2: Write `cymru.test.ts`

Cymru calls `dohResolve(name, 'TXT')` (TXT records have `type === 16`). It makes
TWO calls: the origin query `4.3.2.1.origin.asn.cymru.com`, then
`AS<asn>.asn.cymru.com`.

Create `packages/core/src/providers/cymru.test.ts` with a TXT-aware mock (same
shape as Step 1 but `type: 16` and keyed by name). Tests:

- **Happy path** for `1.2.3.4`:
  - `4.3.2.1.origin.asn.cymru.com` → `['15169 | 8.8.8.0/24 | US | arin | 1992-12-01']`
  - `AS15169.asn.cymru.com` → `['15169 | US | arin | 1992-12-01 | GOOGLE, US']`
  - Assert: `asn === 'AS15169'`, `network_cidr === '8.8.8.0/24'`,
    `country_code === 'US'`, `rir === 'ARIN'` (upper-cased),
    `organization === 'GOOGLE, US'`, `isp === 'GOOGLE, US'`.
- **No origin record** → `lookup` returns `null` (mock returns `[]` for the
  origin name).
- **Origin present but AS-name lookup empty** → `asn` is still `'AS15169'`,
  `organization` and `isp` are `null`.

**Verify**: `pnpm --filter @howismyip/core test` → new cymru tests pass.

### Step 3: Write `ip-api.test.ts`

ip-api calls `fetchJson(...)` (plain JSON, not DoH). Mock `globalThis.fetch` to
return a single JSON `Response`. Tests against `ipApiProvider.lookup('1.2.3.4', {})`:

- **Success payload** with
  `{ status: 'success', country: 'United States', countryCode: 'US', as: 'AS15169 Google LLC', isp: 'Google', proxy: false, hosting: true, mobile: false }`
  → `country_code === 'US'`, `asn === 'AS15169'`, `is_hosting === true`,
  `proxy_type === 'Hosting'`, `is_proxy === false`.
- **`as` field with no AS token** (e.g. `as: ''`) → `asn === null`.
- **Failure payload** `{ status: 'fail', message: 'private range' }` →
  `lookup` returns `null`.

**Verify**: `pnpm --filter @howismyip/core test` → new ip-api tests pass.

### Step 4: Write `rdap.test.ts`

RDAP calls `fetchJson(...)`. Mock returns one JSON `Response`. Build a fixture
that exercises the recursive abuse-contact walk and the helpers. Tests against
`rdapProvider.lookup('8.8.8.8', {})`:

- **Full fixture**:
  ```ts
  const payload = {
    handle: 'NET-8-8-8-0-1',
    name: 'GOGL',
    country: 'US',
    port43: 'whois.arin.net',
    cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
    events: [{ eventAction: 'registration', eventDate: '2014-03-14T00:00:00Z' }],
    entities: [
      {
        roles: ['registrant'],
        entities: [
          {
            roles: ['abuse'],
            vcardArray: ['vcard', [
              ['version', {}, 'text', '4.0'],
              ['email', {}, 'text', 'abuse@example.com'],
            ]],
          },
        ],
      },
    ],
  };
  ```
  Assert: `rir === 'ARIN'`, `network_cidr === '8.8.8.0/24'`,
  `allocation_date === '2014-03-14T00:00:00Z'`, `organization === 'GOGL'`,
  `country_code === 'US'`, `abuse_contact === 'abuse@example.com'` (proves the
  nested recursion + jCard extraction).
- **Neither `handle` nor `startAddress`** present → `lookup` returns `null`.
- **No abuse entity** (drop the nested abuse entity) → `abuse_contact === null`.

**Verify**: `pnpm --filter @howismyip/core test` → new rdap tests pass.

### Step 5: Typecheck and lint

**Verify**:
- `pnpm --filter @howismyip/core typecheck` → exit 0, no errors.
- `pnpm check` → exit 0 (biome is happy with the new files).

## Test plan

- New files: `dnsbl.test.ts`, `cymru.test.ts`, `ip-api.test.ts`, `rdap.test.ts`
  in `packages/core/src/providers/`, each modeled on `helpers.test.ts`.
- Cases per Steps 1–4 above (happy path, the specific boundary each parser
  guards, and the null/early-return paths).
- Verification: `pnpm --filter @howismyip/core test` → all pass, with the new
  tests included in the count (was 14 tests before this plan; expect ~14+ more).

## Done criteria

ALL must hold:

- [ ] `pnpm --filter @howismyip/core test` exits 0; the four new test files run
      and pass.
- [ ] `pnpm --filter @howismyip/core typecheck` exits 0.
- [ ] `pnpm check` exits 0.
- [ ] `git status` shows only the four new `*.test.ts` files added — no provider
      source file modified.
- [ ] `plans/README.md` status row for plan 001 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A provider source excerpt in "Current state" doesn't match the live code
  (drift since `dba0c33`).
- A test you wrote to characterize *current* behavior fails because the provider
  appears to have a real bug (e.g. the `127.255.255.` boundary doesn't behave as
  documented). Report the discrepancy — do not change the provider.
- `globalThis.Response` is unavailable in the test runtime (it should exist on
  Node ≥18). If so, report rather than pulling in a polyfill dependency.
- Mocking `globalThis.fetch` does not intercept the provider's calls (e.g. the
  helper captured a reference to `fetch` at import time) — report this; it means
  the helper would need a small refactor that is out of this plan's scope.

## Maintenance notes

- When a new provider is added, add a sibling `*.test.ts` following the same
  fetch-mock pattern; consider extracting the inline mock into a shared
  `packages/core/src/providers/_test-fetch.ts` once 4+ files duplicate it (left
  inline here deliberately to keep this plan's blast radius to new files only).
- These tests pin *current* parsing behavior. If an upstream provider legitimately
  changes its response shape, update the fixture and the assertion together, and
  note the upstream change in the commit message.
- A reviewer should check that the mocks assert on the *parsed output*, not on
  the mock internals, and that the DNSBL `127.255.255.` case is present (it is the
  highest-value assertion in this plan).
