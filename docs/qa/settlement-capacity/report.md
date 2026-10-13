# Real-campaign capacity and placement cost — #134 / PR #139

The placement generator remains an **opt-in Lab experiment**. Merging this measurement does not authorize default campaign adoption or a smaller acceptance contract.

## Reproducible paired result

The original ten seeds retain **5/10** acceptance. Five held-out seeds were fixed before inspection: **7, 73, 256, 4096, 65537**; **3/5** pass. No seed was replaced. Every complete blueprint is identical to revision 86eb21913f45545dbc49ecc0fc6b4b36efc131a6, repeats under the current code, and round-trips through save/load. The six-parcel fixture, 0.6m grading, 160/40/240m constraints, berth and all successful LOS rays are unchanged.

| Seed | Batch | Six-parcel pair | Contained/required households, P / R | Founding viable, P / R | Expansion viable, P / R | Before s | After s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | fixed | REJECTED | 0/8 / 0/8 | no / no | no / no | 7.60 | 6.79 |
| 42 | fixed | PASS | 0/8 / 0/8 | no / no | no / no | 8.98 | 9.79 |
| 91 | fixed | REJECTED | 0/7 / 0/7 | no / no | no / no | 7.24 | 7.30 |
| 1983 | fixed | PASS | 0/8 / 0/8 | no / no | no / no | 8.73 | 9.00 |
| 1337 | fixed | REJECTED | 1/8 / 0/8 | no / no | no / no | 7.28 | 7.75 |
| 18 | fixed | PASS | 0/9 / 0/9 | no / no | no / no | 9.23 | 9.44 |
| 104 | fixed | REJECTED | 0/9 / 0/9 | no / no | no / no | 15.70 | 17.42 |
| 211 | fixed | PASS | 1/7 / 0/7 | no / no | no / no | 7.77 | 8.16 |
| 512 | fixed | REJECTED | 0/9 / 0/9 | no / no | no / no | 8.96 | 9.02 |
| 819 | fixed | PASS | 0/8 / 0/8 | no / no | no / no | 6.01 | 6.46 |
| 7 | held-out | PASS | 0/8 / 0/8 | no / no | no / no | 9.40 | 10.04 |
| 73 | held-out | REJECTED | 0/8 / 2/8 | no / no | no / no | 13.35 | 15.04 |
| 256 | held-out | PASS | 0/7 / 0/7 | no / no | no / no | 9.21 | 9.16 |
| 4096 | held-out | REJECTED | 0/7 / 0/7 | no / no | no / no | 3.77 | 4.00 |
| 65537 | held-out | PASS | 0/8 / 0/8 | no / no | no / no | 7.86 | 8.35 |

Rejected seeds show the highest-ranked separated candidate pair for diagnosis, **not an accepted reservation**. Their capacity results cannot override pair failure. No active rival clan is created.

## Actual founding and expansion experiment

The experiment calls the current public Simulation Core campaign factory and the actual Fjord projection/plot allocator. Both regions use the same ten-resident founding fixture for a controlled spatial comparison; this does not predict a future CPU clan's population. Inputs, RNG, events and saved worlds are unchanged. The allocator keeps its real **15×15m** household plots, **17m** grid, **7m** camp clearing and existing **0.15m** nine-point flatness requirement. No terrain is graded for this experiment; existing approved player grading is retained, and the rival reservation remains naturally ungraded.

Founding viability requires every household, all ten residents, three cattle, a dry contained camp clearing, connected household approaches and an unobstructed landing-to-camp route with a real longship berth. Plots that the current allocator places outside the reserved zone are explicitly rejected. Nature is treated as removable construction clutter, as in current gameplay; this is a geometry capacity experiment, not authorization to remove assets from a saved world.

Expansion is an explicitly funded spatial fixture: actual BuildHouse commands convert each current household in place; existing plot transfers and permanent-home paths are inspected. A second factory fixture with no founding couples tests ten independent households (0–3 additional household reservations depending on the actual party), without shrinking plots. This is a sensitivity case, **not a guarantee of indefinite growth or every upgraded Farmyard model**. The existing Fjord 15m plots and its source-Farmyard fallback remain separate limitations. Any broader expansion contract needs owner approval.

**No accepted six-parcel pair proves founding-day viability in both regions with the current allocator.** The current game allocator was built around a flatter reference clearing, uses stricter flatness than the 0.6m local grading contract, and may search outside a region. These observations block **default campaign adoption**, not preservation of the useful opt-in placement/LOS experiment.

## Cost investigation

Paired total generation time: **131.09s before, 137.72s after** across the same fifteen requests. These are consecutive before/after observations on this development laptop, not isolated hardware benchmarks or raw render frames. Compilation/loading occurs before the timed calls. Other apps and thermal state can affect results; no hard performance target is invented. This run does **not** demonstrate an overall speedup: the observed total is about 5% higher despite fewer repeated harbor calls. The investigation identifies costs and removes redundant work; it is not a claim that the synchronous generation delay is solved.

- foundations: 70.84s accumulated across fifteen worlds.
- terrain: 17.62s accumulated across fifteen worlds.
- player-navigation: 17.10s accumulated across fifteen worlds.
- nature: 13.62s accumulated across fifteen worlds.
- validation-and-freeze: 3.96s accumulated across fifteen worlds.
- initial-plan: 3.58s accumulated across fifteen worlds.
- compartments: 3.16s accumulated across fifteen worlds.
- final-navigation: 2.94s accumulated across fifteen worlds.
- visibility: 2.37s accumulated across fifteen worlds.
- initial-candidates: 1.65s accumulated across fifteen worlds.
- access: 0.39s accumulated across fifteen worlds.
- final-route: 0.04s accumulated across fifteen worlds.
- harbor: 0.01s accumulated across fifteen worlds.

The seed-104 baseline probe found foundation fit/backtracking and repeated candidate navigation rebuilding dominate; harbor and LOS checks cost much less. Coast extraction now skips wholly dry/submerged cells before allocating canonical crossing triangles, preserving segment order exactly. Harbor and starting viewpoints are cached once per player candidate. Candidate count, rotations, layouts and backtracking budgets are unchanged. More invasive worker/renderer architecture remains outside this issue. **Generation is still synchronous and can block the Lab UI.** Phase observers are opt-in and never serialized.

## Recommended staging decision

Merge as an opt-in Lab research capability, as authorized in the conversation. Keep the actual campaign allocator, default generator, stress acceptance and saved rules unchanged. Before making v0.3e a campaign default, require a separate owner-approved integration contract: region-bounded real plots, bounded per-foundation grading and a defined founding/expansion capacity. Measure that proposal on the same fixed and held-out seeds before adopting yield or performance targets. This change makes no such default-adoption decision.

## Visual evidence and reproduction

[Geometry diagrams and review](review.html) show actual allocated plots for both regions, including out-of-reserve placements. The [five-island overhead/start-camera evidence](../settlement-sites-refinement/review.html) remains applicable because the complete canonical blueprints compare identically with that revision. The view for seed 18 is linked directly in the review. Every region's reasons, geometry, paths, berth, stage timings and input hashes are in [batch.json](batch.json).

Run: node scripts/qa/measure-settlement-capacity.mjs, then node scripts/qa/publish-settlement-capacity.mjs. Run node --test tests/settlement-sites.test.mjs for the public-contract regressions. These research outputs add no gameplay or balance rule.
