# Seasonal structures review

Houses at all four upgrade levels, the authored Farmyard and its props, tents, and the
settlement campfire now receive the canonical seasonal snow treatment in `/fjord-play`.
The native material overlay follows the world-up surface normal. Upward surfaces collect
snow while vertical timber keeps its source colour. The original maps and geometry are
shared; source materials are not modified. No new texture, asset or dependency is needed.

The captures below show the same seed-32 settlement and camera at Winter, Spring thaw,
and Summer, on Low quality. The fixture has one house at each upgrade level, a Farmyard
and five tent households; its smallest house is then upgraded through the UI before the
comparison captures. Seasonal fog/lighting are intentionally included in the comparison.

- [Winter](winter.png): full snow at tick 0.
- [Spring](spring.png): partial thaw at tick 312.
- [Summer](summer.png): no snow at tick 500; source colours return.

## Validation

- Browser regression first failed because none of the static structures had seasonal bindings.
- Real Edge/WebGL browser pass, with touch-emulated controls: all 11 visible structures
  receive snow; residents, cattle and the longship are excluded.
- Building, upgrading and salvaging in Winter update the rendered snow immediately while
  paused. Replaced structures leave no stale seasonal bindings.
- Winter remains fully white at tick 250. Snow amount is 0.3288999168 at tick 312 and zero
  in Summer and early Autumn. Returning to Winter restores 0.65.
- Imports preserve the exact exported Core state. A live Winter-to-Spring crossing reuses
  seasonal material IDs; Pause freezes the transition. Low/Standard quality round trips
  also retain those IDs. No browser page errors or WebGL shader errors were reported.
- 23 existing calendar, lighting and Fjord projection tests passed locally.
- Physical iPad/Safari and device performance were not measured in this pass.

Reproduce: `node scripts/qa/check-structure-seasons.mjs` with the dev server on port 5180.
`QA_ORIGIN` and `QA_OUTPUT` can select a different server/output directory.
These are colour-based snow effects, without simulated depth, heat or new flame animation.
