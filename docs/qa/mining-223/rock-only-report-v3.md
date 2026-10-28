Historical snapshot before the owner added Wet Lowland and Bog Iron. Statements below refer to that earlier revision; see report.md for current evidence.

# Mining #223 — implementation and island export evidence

## Result

The opt-in Mining slice uses the actual physical Core, finite reserves, real resident
routes, the existing occupation/aptitude pipeline and contextual Iron Ore stock.
The owner-requested development trial costs 20 Materials once; bare outcrops have
50% productivity. Both resident and outcrop assignment flows use real atomic
session commands. No shipping-default activation or pool expansion was performed.

Twelve genuinely new island proposals were exported after 127 actual candidates.
All ten current-pool islands also have reachable ore sites around their actual
founding reservations. Fourteen historical baked worlds were regenerated with
identical canonical and compressed bytes; old campaigns retain their geography.

## Version and reproduction

- Workspace: `D:/CodexSites/Pillagers/scratch/mining-223`.
- Branch: `codex/mining-223`; base `4fcbf63ce0b14d227914d7a30c19139fe0baa12e`.
- The implementation is a local feature diff, not a committed release.
- Measurement protocol: `06e99adfa99b518d4cb447864e75f73270f470921fdb998d6ce71c080fe2e5e5`.
- Candidate runner: `2f7efb2034e45f9673574a4de0f6b9ee34a98298c7efbc10c346cfa7f81a7e8e`.
- Physical route probe: `f9c2d3416631f77402d8ec76715d9d88c58348a5a77128d2b8ecf2b919ad91bf`.
- Coordinator: `91cc6c106d53ba83ef4f80c2ab98530d939f8aa4b6e8f83ed4b437b4524aac84`.
- Every one of the 173 transitive executable source hashes is verified against its
  frozen copy. Current execution roots still match that measurement exactly.
- Exact generator, source, rule, runner and local-change metadata is in the full
  manifest inside the bundle. Renderer/model follow-up does not change the
  measured generation/Core roots. The session restart fix is outside those roots.

```powershell
node --test tests/mining.test.mjs tests/mining-presentation.test.mjs tests/mining-assets.test.mjs tests/ore-sites.test.mjs
node scripts/qa/survey-mining-islands.mjs
node scripts/qa/export-mining-islands.mjs D:/CodexSites/Pillagers/scratch/mining-223/scratch/mining-223/new-islands-v3
node scripts/qa/verify-mining-exports.mjs D:/CodexSites/Pillagers/scratch/mining-223/scratch/mining-223/new-islands-v3
node scripts/prepare-mining-assets.mjs D:/CodexSites/Pillagers/Assets/Mining
```

The exporter resumes only when source and protocol hashes match. Per candidate
it is capped at 120 seconds and a 768 MiB JS heap, with two workers. Unsuccessful
seeds remain in raw results. The verifier checks all transport and uncompressed
hashes, all selected results and frozen sources; no rerun is needed to inspect the
bundle. Earlier v1/v2 outputs remain preserved, marked superseded, and are excluded
from the final twelve.

## Current islands

Measurements use the unchanged current v3 physical fixtures, actual player/rival
founding plots and campfire exclusions. Counts are not a promise that an entire
new generated seed range will pass preparation.

| Island seed | Sites | Initial Iron Ore | Reachable around founding plots |
| --- | ---: | ---: | ---: |
| 18 | 4 | 292 | 4 |
| 7 | 4 | 284 | 4 |
| 15 | 4 | 302 | 4 |
| 79 | 2 | 118 | 2 |
| 88 | 4 | 278 | 4 |
| 101 | 4 | 288 | 4 |
| 112 | 4 | 273 | 4 |
| 168 | 4 | 285 | 4 |
| 195 | 4 | 273 | 4 |
| 227 | 4 | 244 | 4 |

Raw data: [existing-islands.json](existing-islands.json).
Compatibility: [historical-islands.json](historical-islands.json).

## Twelve new exports

Of 127 candidates: 35 invalid geography, 79 preparation failures, one rival-route
failure and twelve qualified exports. There were zero technical failures or
resource-limited cases. These are availability results with all failures retained,
not a tuned balance sample or a claim that long-term mining is affordable.

Each qualified case decoded the real pier, validated natural foundations and
actual founding entities, paid for real scouting, discovered the rival and came
home. If one long bounded A* search failed, the QA observer followed the canonical
trail through genuine intermediate ExploreArea commands. This is an observer
route proof, not a new player controller or expanded gameplay search budget.

A separate unchanged founding cohort then paid for a scout, discovered a site,
assigned a real Miner, walked there, extracted at the undeveloped half rate, and
round-tripped the Core save. No injected Food, teleports, remote extraction or
cached unmodified CPU trajectory was used. The observer may inspect geography;
these probes are not an information-limited player strategy experiment.

| Seed | Sites | Initial Iron Ore | Food charged in mining proof | Extracted Iron Ore |
| --- | ---: | ---: | ---: | ---: |
| 296 | 4 | 245 | 8 | 1 |
| 299 | 3 | 174 | 8 | 2 |
| 306 | 4 | 274 | 8 | 1 |
| 327 | 1 | 86 | 8 | 2 |
| 329 | 2 | 122 | 8 | 1 |
| 341 | 4 | 277 | 8 | 2 |
| 351 | 4 | 276 | 8 | 1 |
| 352 | 4 | 246 | 8 | 2 |
| 360 | 2 | 145 | 8 | 2 |
| 361 | 4 | 258 | 8 | 1 |
| 369 | 4 | 232 | 8 | 1 |
| 380 | 4 | 278 | 8 | 1 |

- [Completeness manifest](new-islands-manifest.json)
- [Integrity checks](new-islands-integrity.json)
- [Bundle identity](export-bundle.json)
- Bundle: `scratch/mining-223/mining-islands-12-v3.zip` (31,993,695 bytes).
- SHA-256: `e9b3859afcc49ece831c22851c552879ab6e7ad275efe1eb86302f6dca23ba2e`.

The ZIP contains all twelve full compressed worlds/plans/ore proposals, 127 raw
result files, the original full manifest and frozen sources. It excludes duplicated
candidate files, historical runs and generated dependency trees. The exports
remain outside `public/`; their raw results are retained on D:.

## Mine model and placement

Source: `Assets/Mining/Meshy_AI_Timberdeep_Mine_1028104608_texture.glb`.
The source is unchanged. Runtime: 1,451,832 bytes versus 23,927,404 source bytes;
6 MiB decoded RGBA texture pixels versus 96 MiB (approximately 8 versus 128 MiB
including mipmaps). All 6,731 triangles, positions, normals, UVs and winding are
preserved by a checked geometry signature. Manifest identity is checked before
runtime decoding. These are texture estimates, not measured total device memory.

The actual doorway, behind the projecting rails, faces a level earthen forecourt.
The rear section follows the local hillside; sharp ridges require a local
orientation adjustment. Placement leaves canonical terrain/site/route data
unchanged. A small sloping earthen rim connects to natural ground; presentation
foot support keeps the Miner on its surface. There are ten extra forecourt
triangles per developed mine. Hidden sites have no mesh/pick target and bare
outcrops do not load the authored model. All developed instances share geometry
and textures; seasonal material copies and instance geometry are disposed on
replacement, and the scene owner releases the shared template on disposal.

Headless Blender inspection used the optimized model with actual canonical
terrain patches on islands 18 and 112. This supplements, rather than substitutes
for, the live WebGL/device check. Review fixtures use real Core commands:
[developed-context.json](developed-context.json) records the actual Woodworker
production and construction payment. No review resources were injected.

## Bugs found through owner review

- Cross-engine last-bit terrain math: tight geometric tolerances validate the
  proposal, then retain its exact saved identity. Changed reserve/position data is
  still rejected. [Twenty engine-rounding probes](cross-engine-rounding.json).
- Session batch allowlist omitted Mining: actual assignment/development commands
  are now accepted; no UI-only state mutation.
- Miner assignment could not be reached from resident details: both directions
  work and the legacy occupation dropdown retains Miner.
- Replay inherited the physical Miner prototype before founding: the session
  now strips that extension from a cloned founding config and rebinds it through
  the physical scene, preserving the current save and original founders.

## Validation and remaining review

- Full suite before authored-model follow-up: 1,589 tests, 1,579 passed, zero failed,
  ten existing optional original-source fixture skips. This is not claimed as a
  full-suite run of the latest renderer changes.
- Latest affected contracts: 62/62 passed, including actual Core travel/extraction,
  UI session commits, paid development, old saves, scene disposal/load races,
  all ten current-island placements and campaign replay boundaries.
- TypeScript, production build and public asset validation with `--tracked` passed.
  All 630 public files are tracked, including the optimized mine; original source
  models are excluded. The existing Vite chunk-size advisory remains.
- Existing character/Lab validation passed: 20 assets / 36 GLBs, 12 Golden
  Characters, 19 equipped modules and Idle/Walk/Run + World. No rig was changed.
- No formatter is configured in package scripts; source formatting was reviewed
  manually and `git diff --check` is required before handoff.
- LAN review: `http://192.168.68.115:5181/docs/qa/mining-223/review.html`.
- Physical iPhone/iPad rendering, touch and performance approval remain an owner
  gate. No GitHub CI or public Sites release is claimed for this uncommitted diff.

Keep the candidate capacity/rarity and economic values experimental until owner
review. No refining, other specialist currencies, automatic CPU mining or mining
raids were added. Mining does not make every new island valid and the twelve
exports should be curated as a replacement pool in a separate approved change.
