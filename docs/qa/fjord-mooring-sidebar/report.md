# Fjord mooring and collapsible management regression checks

Date: 2026-10-11. Route: /fjord-play. Desktop Edge with 1024×768 touch emulation.

## Changes

- The canonical 14.47m longship lies parallel beside the source pier. Its 3.48m hull clears
  the 4m pier with a 0.76m lateral gap. Both models use the same local Z heading.
- The stored faering mooring anchor and save format remain unchanged, including existing saves.
  The berth offset is projected afresh, so reloads and repeated updates never accumulate drift.
- Management collapses with ▲ into a small ▼ button at the same upper-right corner, beneath
  the header. Both have 44px touch targets and English accessible names.
- Clock updates retain collapse. A new selection automatically reopens the action panel.
  The canvas viewport remains unchanged and the exposed region accepts touch rotation.

## Reproduction

```powershell
node --test tests/fjord-bridge.test.mjs
node scripts/qa/check-fjord-mooring-sidebar.mjs
```

The projection regression failed first at the old faering position, then passed with the larger
ship berth. The browser regression failed first because the collapse control was absent.
The browser now checks collapse/expand position, touch gestures, automatic reopening after an
actual resident tap, retained collapse through running ticks, and exported Core equality with
replay. It checks the projected ship heading and actual source-model footprint clearance.

[Machine observations](result.json). [Visual review](review.html).

Physical iPad Safari verification is still separate from Chromium touch emulation. This change
adds no gameplay, balance, asset, weather or water-motion rules. It does not introduce a performance gate.
