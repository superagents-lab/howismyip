# Plan 007: Reduce registration and routing redundancy

## Status

- **Priority**: P1
- **Status**: DONE — implemented and verified on 2026-07-28
- **Effort**: M
- **Risk**: MED — refines the public normalized network fields and report UI
- **Depends on**: 006 free network-provenance intelligence
- **Category**: product
- **Planned**: 2026-07-28

## Why

The first provenance UI exposes every normalized field as a peer row. On normal
IPs this repeats the same underlying relationship:

- basic ASN and BGP origin ASN are usually identical;
- organization and origin holder usually name the same operator;
- geolocation and registration country often match.

The rows are individually correct, but the report makes the reader reconstruct
the relationship and does not explain when repeated values are corroboration.
It also labels a shared `network_cidr` as an announced prefix even though RDAP
uses it for a registry allocation.

## Scope

- Replace ambiguous `network_cidr` with explicit `allocation_cidr` and
  `announced_prefix` fields.
- Keep ASN, organization, and location in basic facts as the human-facing
  identity summary.
- Replace peer provenance rows with three relationship rows:
  - registration: country, RIR, allocated prefix;
  - route: origin ASN/holder → announced prefix, announcement state, RPKI;
  - reverse DNS.
- Show whether registration country matches geolocation and whether route
  origin matches the basic ASN.
- Preserve source transparency behind row expansion and highlight conflicts or
  multiple origins instead of hiding them.
- Apply the same compact relationship model to CLI output.

## Done criteria

- [x] Registry allocation and BGP announcement prefixes cannot be merged.
- [x] Default Web view no longer repeats ASN, origin ASN, organization, holder,
      prefix, route state, and RPKI as seven peer rows.
- [x] Matching and mismatching geo/registration and ASN/origin relationships
      are explicit.
- [x] Expanded rows retain the exact constituent facts and sources.
- [x] Core, Web, and CLI verification passes.
- [x] Desktop and mobile browser checks show no overflow or clipped content.

## Verification

- Core: 50 tests pass.
- Web: 20 tests pass; typecheck, Biome, and production build pass.
- CLI: typecheck and build pass.
- Cache key bumped to version 3 so existing six-hour reports cannot leak the
  old `network` fact into the new UI.
- Production preview checked at 1440×1000 and 390×844. Registration, route,
  reverse DNS, row expansion, wrapping, and source evidence all render cleanly.
