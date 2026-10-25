# The Founding Journey #270 — implementation QA

## Source and delivery

- Separate follow-up branch: codex/founding-journey-270.
- Stacked on PR #269 head b8d29094869afad9d582901f78bb3f99bf84e06c.
- Main at preparation: 12518aec36ac0d12bb6fafba8d7856ecc23bc4a3.
- Workspace: D:/CodexSites/Pillagers/scratch/founding-journey-270.
- The paused-entry correction is a separate first commit, ff163be. The chapter layer
  follows in the same reviewable follow-up PR. #269 was not edited or merged.
- LAN preview: http://192.168.68.115:5244/fjord-play.
- No Core rules, balances, original assets, dependencies or expected asset hashes changed.

## Executed focused coverage

24 focused tests passed for the integrated navigation/result and checklist implementation:
four entry/playback contracts, seven real guide/interface DOM journeys,
twelve canonical fact/negative-outcome/sea-travel tests, and one actual
mission-preparation/confirmation DOM test.

The tests cover New/Restart/Continue/import and gated initial Play, slow loading,
story/invitation, queued callback invalidation, warm/lifecycle pause policy and
intentional view handoff. Pause stays reachable during scene work and invalidates
queued elapsed time. The actual preserved founding/full Clan Book controllers
are exercised. Source wiring uses the same playback gate for in-game replacement.

The actual desktop and compact/touch FjordInterface is used for profiles,
households, resident-from-home links, livestock, stocks, eligible work preview,
home improvements and Smithery targets. Show me alone leaves exact canonical
bytes unchanged. Only the real work approval or mission confirmation issues its
normal command. Repeated unchanged refreshes preserve focus and do not save.

The requested subobjective checklist is read-only and derived from the existing
completion facts. Desktop/touch DOM checks follow four real inspections through
0/4 → 1/4 → 2/4 → 3/4 → 4/4, confirm visible ticks, reject manual checkbox
completion and preserve progress through save/load. Show me follows the first
unfinished step. Every model fixture asserts checklist/objective consistency,
including historical credit, waiting missions, real gear and witnessed species.
The real shared navigation markup and MobileShell are used to open Need help?:
the question-mark entry closes the mobile drawer, preserves paused playback and
does not change canonical campaign bytes.

The fact tests use real Core construction, specialization, upgrades, production,
equipment assignment, paid exploration, witnessed sightings, Recon, Pillage and
returns. They include out-of-order credit, unavailable supplies, no duplicate
crafting requirement, two groups' species deduplication, camera-only/foreign
sighting rejection, retained/salvaged/absent/away ship states and save/import.
A destination and same-tick landing are not an earned sailing journey.

Both forced-failure/all-crew-loss and successful-empty-cargo fixtures are resolved
by Core. Their actual mission/event IDs, zero loot, survivor/casualty lists and
returned/lost spear/shield receipts survive reconstruction. The existing Activity
Center record displays this canonical outcome, without another result feed.

Twenty normal founder seeds cover cattle, goats, pigs and sheep, current real
housing/salvage costs and the 15 Food versus 16 Food two-person preparation
shortfall. Guide refreshes are asserted not to run Recon/Pillage route searches;
only explicit existing mission review evaluates route feasibility.

## Original island feasibility

See [measured result](island-feasibility.json). The isolated headless check used
ordinary new-Fjord rules, one actual eligible resident, an 8 Food pack and real
ExploreArea/AdvanceTicks commands on both original island-pool-v1 fixtures:

| Campaign seed | Island seed | Legitimate species recorded |
| --- | --- | --- |
| 0 | 18 | Great black-backed gull, puffin, otter, seal |
| 1 | 7 | Otter, great black-backed gull, seal |

No animals, sightings, intel or resources were inserted. The QA route selector
used actual animal positions solely to assess fixture feasibility; those positions
are never used by the guide or revealed through unexplored fog. This measurement
does not establish uncoached discoverability or a promised completion time.

## Broader verification and inherited conditions

Production build (TypeScript/Vite and public validation) passed for the integrated
chapter implementation. Public validation checks 602 files, 47 Terrain GLBs,
14 prepared islands and 56 exact character sources. The existing >500 kB Vite
chunk warning remains. The final post-copy/report build and exact-head required
GitHub checks are recorded in the follow-up PR.

The complete test suite runs locally and in the existing Character contracts
Action. Final exact-head counts and CI links belong in the PR verification
section; raw local logs are retained under scratch/qa-270, not committed.
Formatting was reviewed manually; no formatter is configured. git diff --check
is used without changing or weakening validation.

The bare character validator reports the inherited gate:
hair/v04-bun LOD2: runtime source still requires reference review.
The prescribed CI command is validate-characters --lab-previews: it audits the
explicit existing Lab preview sources while retaining their visual-review status.
No source, approval flag, provenance receipt or validation setting was changed.
Its actual execution/result is recorded in the PR.

A fresh Windows checkout converted the existing female-hair pipeline script to
CRLF. Before full tests, only the working bytes were restored to the exact
unchanged Git blob (SHA-256 cb8aa6af4311626c56befba617a2741bdc87dd2069d3fa55aee41c5d5803ca4a).
No pipeline logic, test or expected hash changed.

## Acceptance still pending — keep draft

No enabled browser or native app connection is available in this session. HTTP
200/source delivery was verified on the preview; no actual WebGL playthrough,
first-frame recording, screenshot, frame-rate claim or physical iPhone/desktop
layout certification is claimed. jsdom touch branches are not a physical device.

The owner tested the portrait phone preview and requested explicit automatic
subobjective checklists and a Need help? navigation entry; that steering is implemented. This does not complete
acceptance of all chapters. The new chapter copy, phone-landscape/desktop layout and a small
uncoached playtest still need review. Use the questions in the gameplay contract;
do not wait for a hunt or raid to finish before collecting comprehension feedback.

No merge or Sites publication. Land/rebase on #269 only after its own acceptance.
