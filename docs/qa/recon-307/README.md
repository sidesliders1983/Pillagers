# Perimeter Recon validation (#307)

This is the second focused slice of epic #305, stacked on territorial-awareness PR #328. Owner acceptance is deferred to the combined combat/offense QA. Main and public Sites are unchanged.

## Result and source pins

The engine and movement contract is pinned to `f1a67cfff7b64f208d56d8ef53443738b375cb1a`: production build plus 162/162 focused tests across 28 files, no skips. The final UI correction is pinned to `d33ca3a9ceae581a7be91e04b84c30e359f73e7d`: a successful quote clears an earlier refusal. Its 10/10 affected/new and existing UI tests pass. Core, terrain/router and prepared-island files are byte-identical between these two pins. The final production build passes with the normal Vite large-chunk and Three CJS deprecation warnings.

The full island generator ran all 14 versioned entries after the opt-in router change. Every payload hash and canonical geometry entry is identical; the LandRoutes source fingerprint is the only changed generated input. Validation was retained, without repacking stale input.

## Behavior and boundaries

New awareness-enabled Recon uses bounded outside viewpoints and a conserved mission budget; Surveillance reuses a shorter arc. Known static site parcels receive a saved margin, while unknown-area quotes do not read unseen rival layout, stocks or population. A blocked angular sector cannot become a backwards detour advertised as a circuit. No useful safe route means atomic refusal before payment.

Actual living witnesses and reached positions own each saved observation. A newly sighted settlement can abort an initially unknown-area survey before its next unsafe edge. Recall uses the reached trail; blocked return is explicitly Stranded. Reports retain dated evidence and do not refresh the remote clan. Historical direct-route missions and their original RNG contract remain intact.

The 8-candidate policy uses an 8 m default safety margin (bounded configurable 0–32 m), at least two distinct useful viewpoints, and one observation tick per planned stop. A full circuit has eight distinct points and a ninth closing visit. Existing Food, speed, duration, cargo and risk rules are unchanged. Current casualty resolution remains the historical return-time policy until the separate #308 encounter slice; #307 introduces no independent combat roll.

## Executed evidence

| Scenario | Core / public UI | Native Chrome |
| --- | --- | --- |
| Full outside circuit at a known open-land site; whole-segment protection | Pass | Not exercised; synthetic Core fixture only |
| Full mapped-area circuit | Pass | Pass, genuine production seed 7 |
| Coastal partial arc without water walking | Pass | Pass, same production island |
| No safe route and fully terrain-occluded known site | Pass, atomic refusal | Budget refusal passed |
| Unknown-area quote unchanged when unseen rival geography/inventory change | Pass | Not separately exercised |
| First legitimate sighting safely aborts an unsafe unknown-area survey | Pass | Not separately exercised |
| Actual reached witness/tick/event and exact mid-arc/mid-return restore | Pass | Reached receipts and reload passed |
| Recall on approach/mid-arc; single payment and no refund | Pass | Desktop and touch emulation passed |
| Newly blocked return remains Stranded with no invented homecoming | Pass | Not separately exercised |
| Surveillance short arc; existing direct in-flight compatibility | Pass | Historical compatibility captured |
| Same-price changed route requires renewed confirmation | Pass | Normal quote/Back/payment exercised |
| Prior targeting refusal clears behind a valid new quote | Pass, red then green | Corrective desktop/touch checks |

The actual prior `c5340a9310cf2c2c651a3ca6ac5fe26f5198c96d` build was opened separately in native Chrome. Its known-site quote had no observation coverage and its new direct Recon ended inside the canonical parcel. This is an actual before-build comparison, distinct from importing a preserved historical route into the new build.

The genuine funded seed-7 checkpoint contains two real saved group members. New production examples quote 4 Food total (2 each) and 250 ticks: a 360° mapped-area circuit with 9 stops (115 travel/return + 135 observation ticks), a 45° coastal partial arc with 2 stops (122 + 128), and a known-site safe refusal. The full area circuit does not establish full enemy-site coverage. The fixed synthetic site supplies that separate proof. These are route/evidence fixtures, not balance or population-growth measurements.

The initial 30-second cold-navigation timeout executed zero journeys and is preserved. A retry with the existing 180-second scene allowance passed six functional journeys without page errors. Visual review then found a stale targeting refusal behind a valid quote. That UI defect was reproduced by a public DOM test, fixed with two assignments and checked on the corrective UI pin; the older capture remains historical evidence.

## Reproduction and limits

See the raw reports, source/fixture hashes and reproduction scripts linked below. Reproduction requires a source checkout with locked dependencies, Node 24 and the existing native Chrome/Playwright setup. The four genuine portable checkpoints retain exact Shared/Core roundtrips; the UI correction regenerates byte-identical checkpoints. The local review page opens separate paused tabs.

Physical iPhone Safari UAT remains pending at the owner's request. Chrome coarse-pointer landscape is emulation. These functional runs establish no FPS, GPU or phone thermal budget; #328's measured large-population Core overhead remains relevant. On-site combat, in-transit capture and survivors-only homecoming are the next #308 slice. Equipment/animation integration and final offense acceptance remain open.

Evidence files:

- [Validation summary and distinct source pins](validation.json), [engine test log](focused-tests-engine.log), [final build log](build-ui.log).
- [Actual baseline browser run](native-baseline.json), [engine journeys](native-engine.json), [corrective UI run](native-ui.json), [visual review](visual-review.json).
- [Before: direct Recon quote](before-direct-recon-quote.jpg), [after: circuit quote](after-desktop-circuit-quote.jpg), [coastal world and actual crew](after-coastal-world.jpg), [touch quote](after-touch-circuit-quote.jpg), [safe refusal](after-safe-refusal.jpg).
- [Final fixture provenance](fixtures-final.json), [earlier engine fixture provenance](fixtures-engine.json), [byte-identical fixture parity](fixture-parity.json), [archive integrity](archive-integrity.json).
- [Island regeneration proof](island-regeneration.json), [UI red/green proof](status-proof.json), [red excerpt](status-red.log), [green UI log](status-green.log).
- [Initial cold-navigation timeout](historical-cold-navigation-timeout.json) and [initial baseline harness assertion race](historical-baseline-harness-race.json) remain preserved as failed harness attempts, separately from the passing retests.
- [Reproduction instructions](reproduce/README.md), [executed engine harness hashes](executed-script-hashes-engine.json), [UI harness hashes](executed-script-hashes-ui.json).
- Portable saves: [historical warning](legacy-direct-warning.shared.json.gz), [group at home](ready-at-home.shared.json.gz), [area circuit underway](area-circuit-mid.shared.json.gz), [coastal arc underway](partial-arc-mid.shared.json.gz).
