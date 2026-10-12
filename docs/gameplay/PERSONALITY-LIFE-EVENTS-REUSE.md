# Personality Life Events v0.1 · reuse map and decision frontier

Implementation issue: [#120](https://github.com/sidesliders1983/Pillagers/issues/120). Northstar [#121](https://github.com/sidesliders1983/Pillagers/pull/121) is already merged. The accepted Lore/composer stack was delivered through [#118](https://github.com/sidesliders1983/Pillagers/pull/118); this pilot starts from that integration on a separate branch.

Owner-approved test boundaries: public Simulation Core/save-load, paired measurement output, and Gameplay Lab/Chronicle browser behavior. The owner superseded the initial opt-in rollout on 12 October 2026: new player campaigns now default on; existing/legacy saves retain their saved behavior and CPU neighbours stay disabled. No economy, fertility, combat, care or cohesion modifiers and no new animations/model calls.

## Verified reuse

| Concern | Existing seam | Implication |
| --- | --- | --- |
| Annual resolution | `Mechanics.stepMechanicsTick` | Resolve once per fully completed canonical year. Production, mortality, Food consumption, maintenance, family/care and weather occur before `stepWorld`. |
| Real pressure | The newly committed resident `FoodConsumed.shortfall` | Pass the actual finishing-year consumption source into the annual social evaluation; do not infer shortage from stocks or event year labels alone. |
| Mission return/transfer | `WorldExpeditions.stepWorld`, after domestic resolution | Evaluate current availability after committed mission/transfer results; an absent or dead resident cannot participate. |
| Adult/availability | `personaAge`, `personaAway`, `isProvidingCare`, active persona registry | Adult age is the saved `adultAge` (normally 18), separate from work age 16. Care/expedition commitments exclude participation. |
| Kinship | Existing `prohibitedKinship`, parent IDs, reciprocal partners and household membership | Reuse established relationship facts; no all-pairs relationship matrix or romantic-ID repurposing. |
| Random continuation | Existing saved uint32 mechanics stream; named presentation closures are not serializable | Add an isolated, versioned, saved social stream without drawing from `rngState`; missing social state remains disabled. |
| Semantic recording | Sequential event IDs and `eventFacts.participants` | Snapshot all disputants and helper names/ages, incident/context/prior-source references and actual result. |
| Restore validation | `applyCommand`, `serializeState`, `reconstructState`, recursive world validation | Validate social config, scheduler, RNG, working incidents/history and source references; no silent activation on load. |
| Text presentation | Chronicle registry, versioned NarrativePlan, controlled composer, factual appendix | Map only real semantic outcomes. Preserve older plan versions and published chapters. Attempts/failure/success/expiry stay distinct. |
| Lab settings | `GameplaySession.newCampaign/restartCampaign`, Lab settings row and import/load synchronization | One saved new-test-campaign option and a stable readonly diagnostic disclosure; no live event editor or simulation draws in rendering. |
| Shared play views | SharedSettlement/FjordCampaign sidecar save and GameplaySession checkpoint splitting | Reuse existing 2D/3D transfer and five-Winter book boundaries; reading and route switches cannot create extra annual rolls. |
| Measurements | Existing worker-pool study orchestration and per-seed gzip evidence | Adapt orchestration with real Core commands. Normalize event sequence IDs for enabled/disabled semantic comparisons; retain exact social replay for enabled split/resume checks. |

Settled family rules: two complete Winters of birth cooldown and five Winters of childcare. Five-Winter care is correct; the earlier reuse-map discrepancy statement was mistaken. No simulation recalibration is required.

## Owner-approved experimental settings

The owner confirmed Q2 and Q3 on 12 October 2026. These are configurable experiment settings, not default campaign balance:

- Quarrel at a real shortage with an existing tie: 5–30%, increasing with mean Temperament.
- Mediation initiative: 10–30%, increasing with the helper's Temperament; success separately 50%.
- Independent reconciliation: 10–20%, increasing toward calmer mean Temperament.
- At most one new incident and one existing incident evaluated per annual window; one actual participation per resident in that window.
- An incident cannot resolve in its opening window. Failed mediation has a two-year attempt cooldown; reconciliation halves the pair's conflict chance for three years.
- Unresolved incidents expire after five years as explicitly unresolved. Death or transfer out makes an incident inactive; temporary expedition/care commitments block opportunities.

No motive, insult, universal hunger, kindness or moral label is inferred. Fixed-context probability comparisons must separate these social coefficients from existing DNA effects on production. Default-rule cohort: 100 seeds × 25 Winters; controlled public-Core fixtures can supply labelled real shortages/ties/helpers. Uneventful runs remain evidence.

Implementation and exact units: [pilot contract](PERSONALITY-LIFE-EVENTS-PILOT.md).
