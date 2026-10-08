# 08 — Weather

## WEATHER-001 — One weather roll per Region per Winter
**Status:** Canonical direction; probabilities Open

> **As a player, I want each Winter to introduce understandable environmental risk, so that preparation matters without requiring a meteorological simulation.**

Classes: Mild, Normal, Harsh, Severe.

Rules:
- seeded chance roll per relevant Region/Winter;
- Region profile may alter distribution;
- no daily weather simulation.

## WEATHER-002 — Weather modifies existing systems
**Status:** Canonical direction; values Open

Initially weather affects only:
1. Food and Materials production;
2. cattle Food consumption/exposure;
3. mortality risk for personas in tents;
4. expedition/travel duration or risk.

Do not initially add weather-driven happiness, detailed disease, snow depth, clothing warmth or crop micro-simulation.

## WEATHER-003 — Exposure
**Status:** Canonical direction

> **As a player, I want bad Winters to punish insufficient shelter, so that houses and Cattle Pens protect life as well as improve the economy.**

Rules:
- permanent houses largely protect personas;
- Harsh/Severe Winters increase mortality risk for tent residents;
- Cattle Pen protects cattle within capacity;
- exposed cattle face higher risk in Harsh/Severe Winters;
- bad Winters may increase cattle Food consumption.

## WEATHER-004 — Player can respond
**Status:** Canonical direction

> **As a player, I want Winter risk revealed before resolution, so that weather creates decisions rather than unavoidable punishment.**

Sequence:
1. determine/reveal Winter class;
2. player can respond;
3. resolve Winter with modifiers.

Possible response: housing priority, slaughter cattle, postpone raid, preserve Food/resources.

## Implemented Harsh Winter production

New campaigns stop all Food and Materials production during Harsh Winters, including cattle Food output. Work progress is retained. Slaughter and salvage remain explicit player commands. Existing saves preserve their stored weather profiles; a missing Materials production modifier means normal Materials output.


## Current Harsh Winter economy

New campaigns stop all Food and Materials production during Harsh Winters, including cow output. Resident and livestock Food consumption is 150% of baseline. Round each category total upward to whole Food units: three adult cattle require 5 instead of 3 Food. Calves with a zero baseline still consume zero. Work progress is preserved. The announced Winter rules apply through annual resolution. Existing saves retain their stored weather profiles; disabling weather preserves baseline rules.
