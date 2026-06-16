# Plan 005: Drop the composite risk score/verdict — make `Consensus` factual-only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c3a7094..HEAD -- packages/core/src/schema.ts packages/core/src/aggregate.ts apps/web/src/components/report-view.tsx apps/web/src/i18n/messages.ts packages/cli/src/render.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the shared `Consensus` type → web UI, CLI, and the public API response shape all move together; it is a breaking API change)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `c3a7094`, 2026-06-16

## Why this matters

This project's purpose is to **query many IP-intelligence sources and show each
source's answer side by side** — "agreement and disagreement across sources is
the actual intelligence" (README). Today the aggregator also synthesizes a
single **composite risk number** and verdict: `consensus.risk_score` is the
`Math.max` across every source's score, surfaced in the UI as "risk consensus
85/100 · N sources agreed" plus merged proxy/vpn/tor flags.

The maintainer's decision: **stop producing any composite risk score or merged
risk judgment.** The reasons are sound and the change is deliberate:
- The number is mislabeled. It is computed as `max` (worst-case) but presented
  as "consensus / sources agreed" — the opposite of agreement. One aggressive
  source (e.g. a fraud vendor scoring a normal VPN high, or one blocklist hit)
  drives the whole verdict red while every other source says fine.
- The scores are incommensurable: AbuseIPDB's abuse-confidence, IPQS's fraud
  score, and the synthetic DNSBL score (`hits × 40`) are different things on the
  same 0–100 axis; merging them by `max` is semantically meaningless.
- It contradicts the product thesis: collapsing disagreement into one alarming
  number hides exactly the signal the project exists to show.

**Factual fields stay merged** (country, city, ASN, ISP, organization, RIR, and
the blocklist hit-list) — those are objective facts every source queries the
same way, so a consensus of them is legitimate. **Scores and classifications do
not get merged.** Each source's own score and flags remain visible in its own
card and in the per-source risk matrix — that display is the point and must be
preserved untouched.

## Current state

### What `Consensus` is today — `packages/core/src/schema.ts:79-98`
```ts
export interface Consensus {
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  rir: string | null;
  proxy_type: string | null;
  risk_score: number | null; // worst (max) score seen
  risk_level: RiskLevel | null;
  is_proxy: boolean | null; // true if ANY source says so
  is_vpn: boolean | null;
  is_tor: boolean | null;
  is_hosting: boolean | null;
  is_mobile: boolean | null;
  blocklists: string[]; // union across sources
  /** How many providers contributed a non-empty record. */
  source_count: number;
}
```

### How it's built — `packages/core/src/aggregate.ts:79-115`
`buildConsensus` computes `scores`/`maxScore`, derives `riskLevel`, and calls a
helper `anyFlag(...)` for each boolean. The factual fields come from
`firstAvailable(...)`; `blocklists` is a `Set` union; `source_count` is the
count of `ok` sources. The file also defines `anyFlag` (lines 61-77) and imports
`riskLevelFromScore`, `type RiskLevel` from `./schema.js`.

### Where the removed fields are consumed
- **Consensus-level (MUST change):**
  - `apps/web/src/components/report-view.tsx` — the `Verdict` component
    (lines 17-83) renders `c.risk_score`, `c.risk_level`, the `CONSENSUS_FLAGS`
    badges (`is_proxy`…`is_mobile`), and a `c.proxy_type` row. It imports
    `riskColor` from `../lib/format`.
  - `packages/cli/src/render.ts` — `consensusLines` (lines 42-71) renders a
    `risk` line (`k.risk_score`/`k.risk_level` via `riskPaint`) and a `flags`
    line (`FLAG_KEYS` → `k.is_proxy`…). Imports `type RiskLevel`.
  - `apps/web/src/i18n/messages.ts` — `report.consensus`, `report.of100`,
    `report.sourcesAgreed`, `report.noFlags`, `report.type` strings feed only
    that verdict (both `en` and `zh`).
- **Per-source `IpIntelligence` (MUST NOT change) — these are the displays to
  preserve:**
  - `apps/web/src/components/risk-matrix.tsx` — uses `d.risk_score`,
    `d.risk_level`, `d.is_tor`, etc. where `d` is one source's `IpIntelligence`.
  - `apps/web/src/components/source-card.tsx` — same, per source.
  - `apps/web/src/lib/format.ts` — `riskColor`/`riskBarColor` are still used by
    the two components above.
  - All provider adapters set per-source `risk_score`/flags — untouched.

### Documentation that describes the old shape (MUST update)
- `README.md:102-103` — "merges results into a consensus (first-available
  geo/ASN, worst-case risk, any-source-true flags, unioned blocklists)".
- `README.md:62` — "see the consensus verdict and a card per source".
- `skills/howismyip/SKILL.md:64-66` — example JSON shows
  `consensus.risk_score` / `risk_level`.
- `skills/howismyip/SKILL.md:83` — "Lead with the **consensus** verdict (risk +
  flags), then cite which sources…".

### Repo conventions
- Core is zero-dep ESM; imports use `.js` extensions. Tests are `node:test`
  (`node --import tsx --test`). `Dictionary = typeof en`, so `en` and `zh` must
  declare exactly the same keys — remove a key from **both**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Build core | `pnpm --filter @howismyip/core build` | exit 0 (web/cli import core from dist) |
| Core tests | `pnpm --filter @howismyip/core test` | all pass |
| Typecheck core | `pnpm --filter @howismyip/core typecheck` | exit 0 |
| Typecheck cli | `pnpm --filter @howismyip/cli typecheck` | exit 0 |
| Typecheck web | `pnpm --filter @howismyip/web typecheck` | exit 0 |
| Lint web | `pnpm --filter @howismyip/web lint` | exit 0 |
| Build web | `pnpm --filter @howismyip/web build` | exit 0 |
| Lint core+cli | `pnpm check` | exit 0 (biome) |

Run from the repo root. **Build core first** (`pnpm --filter @howismyip/core build`)
before typechecking cli/web — they resolve `@howismyip/core` from its `dist/`.

## Scope

**In scope** (modify only these):
- `packages/core/src/schema.ts`
- `packages/core/src/aggregate.ts`
- `packages/core/src/aggregate.test.ts`
- `apps/web/src/components/report-view.tsx`
- `apps/web/src/i18n/messages.ts`
- `packages/cli/src/render.ts`
- `README.md`
- `skills/howismyip/SKILL.md`

**Out of scope** (do NOT touch — these intentionally keep per-source risk):
- `apps/web/src/components/risk-matrix.tsx` and `source-card.tsx` — they read
  per-source `IpIntelligence`, which is unchanged. The whole point of this
  change is that per-source scores/flags stay.
- `apps/web/src/lib/format.ts` — `riskColor`/`riskBarColor` stay (still used by
  the two components above).
- `packages/core/src/schema.ts`'s `IpIntelligence` interface, `emptyIntelligence`,
  and `riskLevelFromScore` — only the `Consensus` interface changes. Providers
  and per-source data keep every risk field.
- Any provider adapter.

## Git workflow

- Branch: `advisor/005-drop-composite-risk-consensus`
- Commit message e.g. `feat(core)!: drop composite risk score from consensus` (the
  `!` marks the breaking API change, matching the repo's conventional-commit style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Slim the `Consensus` interface

In `packages/core/src/schema.ts`, edit the `Consensus` interface to remove the
eight non-factual fields. The result must be exactly:
```ts
/** Merged "best guess" view across all successful providers. Factual fields only —
 *  no composite score or risk verdict (each source's own scores/flags live in its
 *  per-source record). */
export interface Consensus {
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  rir: string | null;
  blocklists: string[]; // union across sources (factual: which lists the IP is on)
  /** How many providers contributed a non-empty record. */
  source_count: number;
}
```
Removed: `proxy_type`, `risk_score`, `risk_level`, `is_proxy`, `is_vpn`,
`is_tor`, `is_hosting`, `is_mobile`. Do NOT touch `IpIntelligence`,
`emptyIntelligence`, or `riskLevelFromScore` in this file.

**Verify**: `pnpm --filter @howismyip/core build` → expect TypeScript errors only
in `aggregate.ts` (next step fixes them). Note them and continue.

### Step 2: Make `buildConsensus` factual-only

In `packages/core/src/aggregate.ts`:
- Delete the `anyFlag` helper (the function spanning lines ~61-77).
- Rewrite `buildConsensus` so it computes only the factual consensus:
```ts
function buildConsensus(sources: ProviderResult[]): Consensus {
  const ok = sources.filter((s) => s.status === 'ok' && s.data);

  const blocklists = Array.from(
    new Set(ok.flatMap((s) => s.data?.blocklists ?? []))
  );

  return {
    country_code: firstAvailable(ok, 'country_code'),
    country_name: firstAvailable(ok, 'country_name'),
    city: firstAvailable(ok, 'city'),
    asn: firstAvailable(ok, 'asn'),
    isp: firstAvailable(ok, 'isp'),
    organization: firstAvailable(ok, 'organization'),
    rir: firstAvailable(ok, 'rir'),
    blocklists,
    source_count: ok.length,
  };
}
```
- Fix the imports: remove now-unused `riskLevelFromScore` and `RiskLevel` from
  the `./schema.js` import block. Keep `Consensus`, `IpIntelligence`, `IpReport`,
  `ProviderResult`, `emptyIntelligence`. (`firstAvailable` stays as-is.)

**Verify**: `pnpm --filter @howismyip/core build` → exit 0;
`pnpm --filter @howismyip/core typecheck` → exit 0.

### Step 3: Update `aggregate.test.ts`

In `packages/core/src/aggregate.test.ts`, two tests assert removed consensus
fields. Update them to assert the factual consensus, and (to prove per-source
risk is preserved) assert the per-source record instead where relevant:

- The test currently named **'merges geo via first-available and risk via max'**:
  keep the geo/`source_count` assertions; **remove** the
  `report.consensus.risk_score`, `report.consensus.risk_level`, and
  `report.consensus.is_vpn` assertions. Add an assertion that the per-source data
  still carries the score, e.g.:
  ```ts
  const b = report.sources.find((s) => s.id === 'b');
  assert.equal(b?.data?.risk_score, 80); // per-source score is preserved
  assert.equal(b?.data?.is_vpn, true);
  ```
  Rename the test to e.g. `'merges factual fields; per-source risk is preserved'`.
- The test currently named **'unions blocklists and ORs flags to false when all
  say false'**: keep the `report.consensus.blocklists` union assertion; **remove**
  the `report.consensus.is_tor` and `report.consensus.is_proxy` assertions.
  Rename to e.g. `'unions blocklists across sources'`.
- The other two tests ('rejects invalid IPs', 'records per-source status…') only
  touch `asn`/`source_count`/per-source status — leave them unchanged.

**Verify**: `pnpm --filter @howismyip/core test` → all pass.

### Step 4: Rewrite the web summary block

In `apps/web/src/components/report-view.tsx`:
- Remove the `CONSENSUS_FLAGS` constant (lines ~9-15).
- Remove `riskColor` from the `../lib/format` import (keep `countryDisplay`,
  `orDash`).
- Replace the `Verdict` component with a factual `Summary` component that renders
  only the blocklist hit-list (factual) and the factual `<dl>` — drop the risk
  score header, the flag badges, and the `type`/`proxy_type` row:
```tsx
function Summary({ c, t }: { c: Consensus; t: Dictionary }) {
  const rows = (
    [
      [
        t.report.location,
        c.country_name || c.city
          ? `${orDash(c.city)} · ${countryDisplay(c.country_name, c.country_code)}`
          : null,
      ],
      [t.report.asn, c.asn],
      [t.report.isp, c.isp],
      [t.report.org, c.organization],
      [t.report.rir, c.rir],
    ] as Array<[string, string | null]>
  ).filter(([, v]) => Boolean(v));

  return (
    <div className="space-y-3">
      {c.blocklists.length > 0 && (
        <div className="text-danger text-xs">
          {t.report.onBlocklists} {c.blocklists.join(", ")}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted text-xs">{label}</dt>
            <dd className="break-words text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```
- Update the render site (was `<Verdict c={report.consensus} t={t} />`) to
  `<Summary c={report.consensus} t={t} />`.
- Leave everything else in this file (the panel header, raw-JSON toggle, the
  three per-source sections incl. `<RiskMatrix>`) unchanged.

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0 (build core first).

### Step 5: Remove the dead i18n keys

In `apps/web/src/i18n/messages.ts`, remove these keys from the `report` block in
**both** `en` and `zh` (they are now unused): `consensus`, `of100`,
`sourcesAgreed`, `noFlags`, `type`. Keep `onBlocklists`, `location`, `asn`,
`isp`, `org`, `rir`, `queried`, the copy/source keys, the `section*`/`col*`/
`noScore` keys (per-source matrix), and `risk: { low, medium, high }` (still used
per-source).

**Verify**: `pnpm --filter @howismyip/web typecheck` → exit 0 (a leftover
reference to a removed key would error here); `pnpm --filter @howismyip/web lint`
→ exit 0.

### Step 6: Trim the CLI consensus output

In `packages/cli/src/render.ts`:
- Remove `RiskLevel` from the import (`import type { IpReport } from '@howismyip/core';`).
- Delete `riskPaint` (lines ~16-27) and `FLAG_KEYS` (lines ~33-39).
- In `consensusLines`, remove the `risk` line and the `flags` line. Keep the
  header (`▍ ip`), the `blocklists` line, `location`, `asn`, and `registry`.
  The function becomes:
```ts
function consensusLines(report: IpReport): string[] {
  const { consensus: k } = report;
  const lines = [c.bold(c.green(`▍ ${report.ip}`))];

  if (k.blocklists.length > 0) {
    lines.push(row('blocklists', c.red(k.blocklists.join(', '))));
  }
  const location = [k.city, k.country_name].filter(Boolean).join(', ');
  if (location) {
    lines.push(row('location', location));
  }
  if (k.asn) {
    lines.push(row('asn', `${k.asn}${k.isp ? c.dim(` · ${k.isp}`) : ''}`));
  }
  if (k.rir) {
    lines.push(row('registry', k.rir));
  }
  return lines;
}
```
The per-source `sourceLines` (status/timing list) is unchanged — each source's
own detail still prints there.

**Verify**: `pnpm --filter @howismyip/core build` then
`pnpm --filter @howismyip/cli typecheck` → exit 0; `pnpm check` → exit 0.

### Step 7: Update the docs

- `README.md`: change the architecture sentence (lines ~102-103) to describe the
  consensus as factual-only, e.g. "merges the **factual** fields into a consensus
  (first-available geo/ASN/registry, unioned blocklist hits) and leaves every
  risk score and proxy/VPN judgment per-source — agreement and disagreement
  across sources is shown, never collapsed into one number." Adjust the line ~62
  "consensus verdict" wording to "the per-source comparison" or similar (no
  single verdict anymore).
- `skills/howismyip/SKILL.md`: in the example JSON (lines ~64-66) remove
  `risk_score`/`risk_level` from the `consensus` object so it matches the new
  shape (keep the factual fields + `blocklists` + `source_count`); reword line
  ~83 from "Lead with the consensus verdict (risk + flags)" to something like
  "There is no composite risk score — report each source's own score/flags and
  call out where sources disagree."

**Verify**: `grep -n "risk_score\|risk_level" skills/howismyip/SKILL.md` shows no
matches **inside the `consensus` object** (per-source example fields, if any, may
remain — read the file to confirm you only edited the consensus example).

## Test plan

- Update the two `aggregate.test.ts` cases per Step 3; the suite must still pass
  (`pnpm --filter @howismyip/core test`). New assertions prove (a) factual
  consensus is intact and (b) per-source `risk_score`/flags survive on
  `report.sources[].data`.
- No new web/CLI test harness is in scope. Web verification is typecheck + lint +
  build; CLI is typecheck + `pnpm check`.
- Optional manual smoke: `pnpm --filter @howismyip/core build` then
  `node --import tsx packages/cli/src/bin.ts 8.8.8.8` → output shows the factual
  consensus block (ip / blocklists / location / asn / registry) and the
  per-source list, with **no** `risk` or `flags` consensus line.

## Done criteria

ALL must hold:

- [ ] `Consensus` in `schema.ts` has exactly the 9 factual fields (no
      `risk_score`/`risk_level`/`proxy_type`/`is_*`).
- [ ] `grep -rn "consensus\.\(risk_score\|risk_level\|is_proxy\|is_vpn\|is_tor\|is_hosting\|is_mobile\|proxy_type\)" apps packages`
      returns no matches (no consumer reads a removed consensus field).
- [ ] `pnpm --filter @howismyip/core test` exits 0 (updated assertions pass).
- [ ] `pnpm --filter @howismyip/core typecheck`, `…/cli typecheck`,
      `…/web typecheck` all exit 0 (build core first).
- [ ] `pnpm --filter @howismyip/web lint` and `pnpm check` exit 0.
- [ ] `pnpm --filter @howismyip/web build` exits 0.
- [ ] `risk-matrix.tsx`, `source-card.tsx`, and `format.ts` are unchanged
      (`git status` shows them absent from the diff).
- [ ] README and SKILL.md no longer describe a composite risk score/verdict.
- [ ] `plans/README.md` status row for plan 005 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A "Current state" excerpt doesn't match the live code (drift since `c3a7094`).
- Removing the i18n keys leaves a typecheck error you can't trace to the `Verdict`
  rewrite — it means a removed key is used somewhere this plan didn't account for;
  report the location.
- You find a consumer of `consensus.risk_score`/`risk_level`/flags outside the
  in-scope files (e.g. a route loader or another component) — report it rather
  than editing an out-of-scope file.
- Touching `risk-matrix.tsx` / `source-card.tsx` / `format.ts` appears necessary
  to make typecheck pass — that should not happen; if it does, STOP, because it
  means per-source data was affected (it must not be).

## Maintenance notes

- **Breaking API change**: `GET /api/ip/:ip` and `/api/me` responses no longer
  include `consensus.risk_score`, `risk_level`, `proxy_type`, or the merged
  `is_*` flags. Consumers (the CLI ships in this repo and is updated here; any
  external agent reading those fields) must switch to reading per-source
  `sources[].data.*`. Call this out in any release notes / changelog.
- Per-source risk is deliberately retained — the risk matrix and source cards are
  where users compare scores and see disagreement. A reviewer should confirm
  those two components are untouched and still render each source's score/flags.
- If a future request asks for "a quick overall signal", do not reintroduce a
  `max` score; prefer a dissent-aware summary (how many sources flagged, with the
  individual scores shown) — that was the explicitly chosen direction.
