# Plan 006: Add free network-provenance intelligence

## Status

- **Priority**: P1
- **Status**: DONE — implemented and verified on 2026-07-28
- **Effort**: L
- **Risk**: MED — expands the public API shape and corrects the meaning of
  country facts across existing sources
- **Depends on**: 003 edge cache, 004 public API rate limit
- **Category**: product
- **Planned at**: commit `2fcdaf7`, 2026-07-28

## Product constraint

howismyip may add an upstream supplier only when it is:

1. fully free, open-data, or offers a recurring free allowance;
2. accessible through an official machine-readable interface;
3. usable by a cached public service under the supplier's published policy;
4. source-transparent — its facts and classifications remain attributable;
5. quota-protected when the allowance or fair-use policy is finite.

Purely paid suppliers are out of scope. A free trial that does not renew is not
a recurring free allowance.

## Why this iteration

The current normalized `country_code` mixes different meanings:

- geolocation providers report where they believe the IP is used;
- RDAP reports the registrant's country;
- Team Cymru reports the registry country attached to an origin record.

The facts UI then compares all of these as if they answered the same question.
This can turn a meaningful "registration versus geolocation" mismatch into an
ambiguous generic country conflict.

The free RIPEstat Data API also exposes several provenance dimensions the site
does not currently show: route announcement state, origin ASN/holder, RPKI
validity, and reverse DNS.

An implementation spike on 2026-07-28 found two upstream constraints:

- DNS Blocklists is asynchronous and remained `pending` across immediate
  retries. The current synchronous lookup plus six-hour edge cache would risk
  caching "not finished" as "clean".
- Transfer History returned HTTP 500 for a normal announced prefix. It is not
  reliable enough to join the default request fan-out yet.

Both remain valuable future dimensions, but are deliberately deferred until the
report model can represent pending/unreliable sub-checks without false claims.

## Scope

### Data model

- Keep `country_code` / `country_name` for geolocation.
- Add `registered_country_code` for registry/allocation country.
- Add normalized network-provenance fields:
  - `ptr`
  - `is_announced`
  - `origin_asns`
  - `origin_holders`
  - `rpki_status`
- Add factual summary keys for registration country, network prefix, PTR,
  announcement, origin ASN/holder, and RPKI.

### Existing providers

- RDAP and Team Cymru populate `registered_country_code`, not geolocation
  `country_code`.
- Supplier-specific residential-proxy detections remain upstream evidence for
  the generic proxy signal; they are not exposed as a normalized field.

### New free supplier

Add one keyless `ripestat` provider using official HTTPS JSON endpoints:

- prefix overview;
- reverse DNS IP;
- RPKI validation when one or more origin ASNs and a prefix are available.

Endpoint failures are isolated inside the provider. The provider returns useful
partial data when at least one endpoint succeeds, with every raw endpoint
payload/error retained for audit.

### Web and CLI

- Show geolocation and registration country as separate facts.
- Show the new network-provenance facts in the existing basic-facts section.
- Keep the existing design system; no redesign.

### Quota and documentation

- Add `ripestat` to hosted provider budgets. One lookup can fan out to several
  RIPEstat endpoints, so use a conservative lookup budget.
- Document the supplier, dimensions, fair-use note, and free-supplier policy.
- Update the bundled skill's output interpretation only where the public JSON
  schema changes; no skill feature expansion.

## Out of scope

- Paid-only suppliers such as Spur or paid IPinfo privacy tiers.
- RIPEstat DNS Blocklists and Transfer History until asynchronous/unreliable
  sub-check states have a safe representation.
- SOCKS credentials, proxy exit testing, AI-service unlock tests, and latency
  triangulation; these cannot be determined from an arbitrary IP lookup.
- A composite score, provider weighting, or a "good/bad IP" verdict.
- Treating PTR patterns, RIR, or RPKI status as proof that an IP is residential.

## Test plan

- Provider parser tests for complete, partial, and multi-origin RIPEstat
  responses.
- Aggregate tests proving registration country no longer conflicts with
  geolocation country.
- Provider parser tests proving residential-proxy signals survive
  normalization.
- Core build, tests, and typecheck.
- CLI typecheck.
- Web unit tests, typecheck, lint, and production build.
- Browser verification of an existing report fixture or live keyless lookup
  when network access is available.

## Done criteria

- [x] Registration country and geolocation country are separate in JSON and UI.
- [x] RIPEstat appears as a keyless source and returns normalized provenance.
- [x] Deferred DNSBL/transfer endpoints cannot be interpreted as clean because
      they are not queried in this synchronous iteration.
- [x] Residential proxy is independently visible in per-source signals.
- [x] Hosted configuration caps RIPEstat lookups.
- [x] Documentation lists only suppliers actually supported by the product.
- [x] All verification commands pass.

## Verification

- Core: 49 tests pass; typecheck and build pass.
- Web: 20 tests pass; typecheck, Biome check, and production build pass.
- CLI: typecheck and build pass.
- Production-preview browser smoke test for `8.8.8.8` showed the new provenance
  section and expanded RPKI → RIPEstat source attribution correctly.
- The RIPEstat adapter is covered for full success, partial endpoint failure,
  complete base-endpoint failure, PTR parsing, and mixed RPKI statuses.
