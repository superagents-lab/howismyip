# Plan 009: Preserve basic fact grid alignment

## Status

- **Priority**: P1
- **Status**: DONE — implemented and verified on 2026-07-29
- **Effort**: S
- **Risk**: LOW — presentation-only; normalized facts and attribution stay unchanged
- **Depends on**: 008 integrate network evidence into basic facts
- **Category**: product
- **Planned**: 2026-07-29

## Why

Embedding registration and routing summaries inside the country and ASN blocks
made those blocks taller than the rest of the two-column basic-fact grid. The
relationships were semantically close to the conclusions they validate, but
the variable block heights weakened alignment and scanability.

## Scope

- Keep every basic fact block limited to its primary value, source count, and
  conflict state.
- Move registration and routing summaries into a full-width evidence strip at
  the bottom of the same basic-information card.
- Keep the strip visually subordinate and omit a second section heading.
- Preserve independent source counts, anomaly colors, and expandable provider
  detail.
- Keep reverse DNS as a normal basic fact.

## Done criteria

- [x] Country and ASN blocks use the same compact anatomy as peer facts.
- [x] Registration and route summaries do not affect basic-grid row height.
- [x] The evidence strip remains inside the basic-information card.
- [x] Registry and routing provider detail remains expandable.
- [x] Desktop and mobile layouts have no horizontal overflow.
- [x] Web tests, typecheck, formatting checks, and production build pass.
