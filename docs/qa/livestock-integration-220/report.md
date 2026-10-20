# #220 owner amendment — herd information and real raid integration

This bounded integration follows the 20 October 2026 owner amendment. It does
not rerun the 360-campaign matrix, activate candidate livestock coefficients,
guarantee founding overlap, improve loot selection or change navigation.
Chicken/Goose meshes remain explicitly deferred by the owner. This report does
not claim completion of those assets or physical-device visual acceptance.

## Source and scope

- Branch: `codex/livestock-models-220`; integration parent
  `dd42387134074ccfbc4afa89ae55fc961a011414`. Earlier local model commits
  `a13a05b` and `2911771` are retained. The parent includes the approved #231
  ordinary eight-Food pack as an explicit dependency; no merge is implied.
- Frozen overlap protocol revision:
  `05e8d8afc4599479d664782c8f6364f0a18f03ac`, protocol SHA-256
  `6b8c3b5c6163422ede53189e47ddefc19d55a1ab4775584ffac5b1849fcb162e`.
  Available study head: `5ff93b8707f87ef9598e887dacc9d3677bd7d01d`.
  Its runtime `src` tree is exactly the original
  `37e8ba72e2b0127806097a886966758df1991998` tree. Preparation asserts this
  identity and rejects dirty runtime source. Historical files remain unchanged.
- [Exact source manifest](source-manifest.json) records every current runtime
  source file and the bounded runners/tests/checkpoints. Its parent revision
  precedes this integration commit; the hashes identify the actual working
  source rather than silently substituting main.
- [Coupling manifest](checkpoints/manifest.json) pins original compressed case
  hashes and six extracted paid mid-raid saves. The source coupling evidence
  contains 60 cases, 22 with captures, covering all six species. These six
  continuation checks are compatibility checks, not new independent samples.

## Delivered behavior

The directory, animal cards and Farmyard cards summarize breeding by species
and actual herd location. Same-species, age-eligible male/female combinations
are distinguished from young possible replacements, animals past the breeding
window, separated yards, birth intervals, space and the actual same-boundary
feeding guard. Canonical birth predicates are shared with the read model;
no RNG is drawn or derived flag saved. There is no relatedness check in the
existing birth resolver and none is added here.

Slaughter confirmation gives a nonblocking warning when the actual preview
removes the last age-eligible combination in that species/herd. Existing
weighted occupancy and assignment commands are reused. No production domestic
management policy or frozen research slaughter policy is replaced.

Returned Pillage reports link the actual animals to cards, distinguish current
age/breeding status from immutable return facts and expose capture history.
Young animals use their age-appropriate role rather than an adult sex label.
No livestock recovered is reported without an invented explanation. Biological
origin and parents are preserved; capture history is a separate factual record.

## Real transfer checks

[Raw six-species results](transfer-replay.json) continue original paid physical
Pillage missions through the public Core commands. They never invoke an
internal transfer function or reroll success to obtain suitable breeding stock.

For cattle, chicken, pig, sheep, goat and goose:

- The animals remain donor-owned until the canonical return tick. Before that
  tick none has appeared in the receiving herd.
- Actual results, complete animal records/archives, stocks, RNG and both clocks
  match the source reference. Transfer preserves ID, species, sex, age, parents,
  origin and production progress; the yard is initially unassigned.
- Tick batching and a save/load one tick before return produce exact equality.
  Each ID has one current owner and one arrival receipt. Real `AssignLivestock`
  commands work, names remain unique and assignment survives save/load.
- The modified donor continues stepping; an unmodified cached trajectory is
  never substituted.

The focused tests additionally cover a real born-and-captured young animal
becoming age-eligible and later passing the breeding window, a successful raid
recovering only Food, partial livestock cargo and immutable recorded receipts
after slaughter. Explicit risk/birth fixtures are test contracts, not production
balance measurements or forced outcomes in the island checks below.

## Physical fixtures 7 and 18

[Raw physical results](physical-integration.json) are source-pinned continuations
of the original `01-cattle-C` and `02-cattle-C` records. Preparation replays their
recorded public commands from the original founding state and verifies its hash.
Their historical ten-Food Explore packs remain historical. Both fixtures use
the regenerated canonical terrain/navigation hashes, real campfire/foundation
exclusions and genuinely sighted/reported sites. No rival-coordinate bypass is
used to dispatch a mission.

| Fixture | Current continuation | Actual outcome |
| --- | --- | --- |
| Island 7 | Scouted site after Explore and returned Recon; two-person Pillage costs 10 Food, duration 500 ticks, 60% success and 10% casualty risk | Mission failed; zero cargo, both crew returned. Exact mid-raid save/load equality. No retry or forced success. |
| Island 18 | Sighted site; Recon attempted with 224 Food available | Refused by the existing exploration search limit. This is a navigation dependency, not insufficient Food or proof of an impassable route. |

A separate clone of each ready-group checkpoint verifies the new ordinary
two-person #231 offer: 16 Food, 2,000 active ticks, no QA override. That probe
does not alter the historical mission continuation. Recon/Pillage fees remain
their existing separate rules. Search-limit resolution remains outside #220
(the existing #151 dependency); it is not concealed by a larger pack.

## Verification and limits

- **25 focused tests pass**, zero failures/skips: breeding/location/guard,
  actual mixed occupancy, risky slaughter availability, captured age progression,
  six-species transfer parity and existing species contracts. [Raw output](focused-tests.txt).
- The initial full suite executed **1,065 cases: 1,044 passed, 11 failed and
  10 existing skips**. The full-suite run and corrected reruns are recorded separately
  in [full-suite output (gzip)](full-suite.txt.gz) and [integration rerun](exploration-rerun.txt).
  The initial run exposed two old runner assertions charging 2 Food after #231;
  they were updated to 8. Two ordinary packs require 16 against unchanged
  founding Food 15, so the scenario now earns the missing Food through real
  Core production before packing. Both real-island scenarios then pass,
  retaining replay/CPU/save/discovery assertions. No funding top-up or weakened
  biological assertion is introduced.
- The other nine failures were the current population diagnostic loader's
  source-text hook for the extracted breeding predicates. Its strict hook now
  observes the actual interval/space helpers rather than the previous inline
  expression; it still rejects an unknown seam. **All 14 population tests pass**
  on rerun, including diagnostic-versus-canonical event/RNG/save equality and
  its bounded CLI smoke. [Raw output](population-rerun.txt). Historical reports
  and the separate frozen study checkout were not altered. All 11 failures are
  covered by passing targeted reruns; the complete suite was not rerun a second
  time. The ten existing skips remain visible and are not labelled passes.
- Production build, public-asset validation and TypeScript passed:
  [build output](build.txt). The existing bundle-size warning remains.
- Browser: actual IslandMissionPanel and SettlementPanel, returned Goat and
  Chicken receipts, inspect links, expanded breeding details and real yard
  assignment. Desktop, 390×844 and 1180×820 have no horizontal overflow.
  The restored full island-7 Fjord scene shows the actual failed raid, zero
  livestock, two returned crew, dated Scouted knowledge and the new 16-Food
  ordinary quote. [Desktop](desktop-report.jpg), [phone](mobile-card.jpg),
  [full Fjord](fjord-failed-raid.jpg).
- Responsive browser inspection is not a physical iPad/iPhone performance test.
  Supplied Cattle/Goat/Pig/Sheep visual/death evidence remains in the separate
  [model report](../livestock-models/report.md). No Chicken/Goose render is
  substituted with cattle. No simulation numbers prove play enjoyment.
- No formatter is configured; changed source was manually reviewed and
  `git diff --check` is used. No GitHub merge, default balance activation or
  public Site publication is part of this local integration.

## Reproduction

From this worktree with its existing locked dependencies:

```powershell
node --test tests/livestock-management-220.test.mjs tests/livestock-raid-report-220.test.mjs tests/livestock-species.test.mjs
node scripts/qa/check-livestock-integration-220.mjs
node --test tests/exploration-integration.test.mjs
pnpm run build
node scripts/qa/record-livestock-integration-evidence.mjs
pnpm exec vite --host 0.0.0.0 --port 5194 --strictPort
```

The committed checkpoints make the checks runnable without the sibling study
checkout. To regenerate those checkpoints, first restore the exact documented
study sources/results, then pass its path explicitly; do not substitute main:

```powershell
node scripts/qa/prepare-livestock-transfer-checkpoints.mjs ../livestock-overlap-study
node scripts/qa/prepare-livestock-island-checkpoints.mjs ../livestock-overlap-study
```
