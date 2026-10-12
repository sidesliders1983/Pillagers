# Campfire fuel and VFX spike — review

Recorded 2026-10-12T16:10:42.867Z. Refs #97; the broader VFX backlog remains open.

## Result

The stone campfire can be selected by touching its mesh and has the existing selection ring. Its contextual panel lights or extinguishes the fire. Lighting buys 1,000 burning ticks for 1 Material. Extinguishing banks unused ticks; relighting uses those first. An empty stock disables a fresh lighting command, and an exhausted fire goes out before its next unpaid burning tick.

Flame, smoke and sparks use three.quarks 0.16.0 with the existing Three.js 0.180.0. Low is the default. Winter snow on the campfire fades over three active seconds and returns over six after extinguishing. Other structures keep their seasonal snow. The original mesh contains pale ash/stone details that remain after thaw. Nearby terrain is not thawed.

## Validation

- Production build passed.
- 54 targeted tests passed across campfire, Fjord bridge, shared settlement, seasons, lighting and interactions. Six new campfire tests cover public Core commands, precise fuel boundaries, banked fuel/save-load, rejected commands, deterministic replay, malformed saves and Clan Book accounting. Red failures were observed before their implementation.
- Browser: headless Microsoft Edge, 1180×820, touch emulation. All 12 recorded scenarios passed, with zero page/console errors.
- Scenarios: touch mesh selection and ring; canonical lighting cost; gradual local thaw; pause; effects off/low/normal; reduced motion; save/load twice; world quality; extinguish and bank fuel; relight; +1 Year canonical equality; empty stock disabled.
- Repeated imports and world quality changes preserve canonical fuel and rebuild a single three-system effect. +1 Year matches the direct Core result.
- A physical iPad was not tested. The attempted background-tab check did not produce document.hidden in this headless environment, so background suspension is not claimed as browser-verified. The runtime explicitly gates updates on visibility.

## Timing observations

| Fire effects | Mean RAF interval (ms) | p95 (ms) | Live particles | Whole-scene draw calls |
| --- | ---: | ---: | ---: | ---: |
| off | 61.7 | 100.1 | 0 | 33 |
| low | 32.2 | 50.0 | 18 | 38 |
| normal | 44.4 | 83.3 | 38 | 38 |

Each mode records exactly 90 requestAnimationFrame intervals at the same camera after its own warm-up, with the campaign paused during sampling. These raw intervals are in [results.json](results.json); warm-up timings and all earlier frames are not recorded. The scene advances between warm-ups, so actor positions and visible geometry can differ. Laptop/background load is uncontrolled: these are whole-browser observations, not isolated GPU cost or a reliable performance ranking. No fixed FPS acceptance gate is applied. The effect itself uses two particle batches and reuses one existing non-shadowed point light/halo.

## Review

[Image comparison](review.html) · [Implementation and public sources](../../CAMPFIRE-VFX-SPIKE.md).

To review live, open /fjord-play, select the campfire and choose Light campfire. Run the clock to see the flame and gradual thaw; pause freezes the effect. Fire effects in Menu switches Off/Low/Normal without changing fuel consumption.
