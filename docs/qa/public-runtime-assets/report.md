# Versioned public runtime assets

## Problem and result

A fresh checkout omitted public/game-assets/houses and its manifest because of .gitignore. The earlier world at / attempted to parse Vite's HTML fallback as JSON. It also loaded scenery directly from ignored Assets/Terrain. Public Human benchmark metadata and a standalone model preview were local-only as well.

All 453 current public files are now staged for version control, including the prepared houses/Farmyards, benchmark models, Human manifest and preview dependencies. Assets/ remains ignored. Terrain is published at public/terrain; runtime loaders and the longship use that location. Vite no longer serves or copies private source scenery. The locked Three.js Draco decoder remains a dependency served in development and copied to the actual configured output directory for production.

## Terrain publication

The 47 original kit GLBs already use Draco compression: 319,712 bytes total. The publisher compares a lossless Meshopt candidate with each original and verifies decoded triangle/material counts and bounds. Every original Draco payload was smaller, so all 47 are published byte-for-byte unchanged. No extra size reduction or geometry simplification is claimed. The manifest records exact source/published SHA256, sizes, encoding, triangles and bounds. Source files remain local in Assets/Terrain.

## Verification

- Public validator passes for 453 files, all declared houses, Human LODs and cattle variants, plus 47 decoded Terrain models. It checks hashes where declared, GLB containers and local external glTF resources. --tracked verifies every public file is in the Git index; no Assets/ files are tracked.
- Removing the house manifest in the isolated worktree causes validation to fail before browser startup. It was restored immediately after the negative check.
- TypeScript and the normal production build pass without an Assets/ directory. The build now runs the public validator; CI additionally requires tracked public files.
- 18 existing Fjord bridge/island regression tests pass (0 failures/skips).
- Real browser checks use a fresh worktree with no Assets/ or private source middleware. All model/manifest/decoder requests succeed and return assets instead of HTML. The current Fjord scene contains an actual built house and longship and has no placeholder actors. Both earlier-world routes and the separately published benchmark preview also open successfully.

| Server | Route | Successful model/manifest/decoder responses | Page errors |
| --- | --- | --- | --- |
| Vite development | / | 61 | 0 |
| Production preview | / | 61 | 0 |
| Production preview | /fjord-play | 101 | 0 |
| Production preview | /model-preview/ | 1 | 0 |

[Raw requests and source hashes](browser.json) · [Development world](development.png) · [Production world](production.png) · [Fjord game](fjord-play.png) · [Model preview](model-preview.png).

These are desktop browser loading checks, not physical-device performance measurements. The older preview now references its committed benchmark GLB instead of an ignored tools/ output; its UI is English and the unmodified Three.js vendor files retain their MIT license. There is one pre-existing whitespace warning inside vendored Three.js; it is preserved. No formatter is configured; handwritten changes were reviewed manually and checked with Git's whitespace check separately from the unmodified vendor code.

Reproduce: install locked dependencies, run npm run validate:public, npm run build, and npm run preview, then open /fjord-play. No authoring regeneration or source asset transfer is required. scripts/qa/check-public-runtime-assets.mjs records the development/production/browser cases using isolated local ports 5320 and 5321.
