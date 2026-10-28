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

## Current seasonal production (owner correction, 28 October 2026)

The saved annual weather class affects **production during the Winter calendar quarter only**: ticks 0–249 in a 1,000-tick year. Spring starts at tick 250. Food and Materials work and all livestock output resume their ordinary rates from that point through Summer and Autumn. Harsh Winter stops Food and Materials production; Severe Winter retains its saved Food reduction (50% by default). Mild's saved production bonus also applies only in Winter. Existing work and livestock production remainders survive the transition.

Every production tick uses the season in which the work occurred, including the final Winter tick and the final Autumn tick. Inspection shows the rate for the next tick. Batch advancement, split advancement and save/load use the same canonical boundaries, without an extra weather roll or clock.

This timing correction applies when continuing existing campaigns too. Saved profile coefficients, previous events and historical measurement reports are retained; previous annual output is not recalculated. Historical reports made before this correction used year-long production modifiers and are not current balance measurements.

## Annual consumption and exposure

Only production timing changes. The saved annual weather class still governs annual consumption, mortality/exposure and existing mission duration/risk. The outgoing year's class remains active through annual resolution before the next class is drawn.

Harsh resident and livestock Food consumption remains 150% of baseline. Each category total rounds up to whole Food units: three adult cattle require 5 instead of 3 Food. Calves with zero baseline still consume zero. Severe retains normal resident consumption and the saved livestock modifier (three times adult cattle Food by default). Existing campaigns retain their saved coefficients; missing Materials production modifiers mean ordinary output. Disabling weather preserves baseline rules. Slaughter and salvage remain explicit player commands.
