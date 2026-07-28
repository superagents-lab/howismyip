# Plan 008: Integrate network evidence into basic facts

## Status

- **Priority**: P1
- **Status**: DONE — implemented and verified on 2026-07-29
- **Effort**: S
- **Risk**: LOW — presentation-only; normalized facts and source attribution stay unchanged
- **Depends on**: 007 reduce registration and routing redundancy
- **Category**: product
- **Planned**: 2026-07-29

## Why

The compact registration and routing relationships introduced in plan 007 were
still presented as a second section beneath basic facts. Even though the rows
were semantically clearer, normal reports repeated the country and ASN context
across a visible section boundary.

Registration evidence explains the country result, and routing evidence
explains the ASN result. They should therefore appear next to the conclusions
they corroborate rather than as a peer module.

## Scope

- Remove the standalone registration and routing section from the Web report.
- Add registry country, RIR, and allocated prefix beneath the basic country row.
- Add origin ASN, announced prefix, route state, and RPKI beneath the basic ASN
  row.
- Keep geolocation/identity source counts separate from registry/routing source
  counts.
- Make reverse DNS a normal basic fact.
- Preserve exact constituent values and providers in the expanded country and
  ASN rows.
- Keep registration/location and ASN/origin mismatches visually prominent.
- Fall back to an unknown country or ASN row when only contextual evidence is
  available, so integration never hides data.

## Done criteria

- [x] The Web report has no standalone registration and routing heading.
- [x] Country and ASN rows show their contextual evidence and independent source
      counts.
- [x] Reverse DNS appears in the basic facts grid.
- [x] Expanding country or ASN exposes both the basic fact and the related
      registry/routing facts with provider attribution.
- [x] Missing base country or ASN values cannot suppress available contextual
      evidence.
- [x] Desktop, tablet, and mobile layouts have no horizontal overflow.
- [x] Web tests, typecheck, formatting checks, and production build pass.

## Verification

- Web component coverage confirms the merged information architecture, source
  expansion, reverse DNS placement, and existing residential-proxy signal.
- ego-browser checked the live 8.8.8.8 report at 1280×900, 640×900, and
  390×844.
- Real pointer interactions expanded and collapsed country and ASN evidence.
- The 640px pass found and drove fixes for a premature two-column breakpoint
  and long provider-name wrapping; final desktop, tablet, and mobile checks
  report no horizontal overflow.
- ego-browser's screenshot/CDP screencast endpoints were unavailable in the
  active runtime, so visual verification used its semantic snapshot, real
  interaction, bounding boxes, viewport metrics, and overflow inspection.
