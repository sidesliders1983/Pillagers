# Generated Meshy housing in Fjord

Fjord now uses the four authored standard houses (Hut, Homestead, Longhouse and GreatHouse), plus the available farmer Hut and Homestead variants. The existing storehouse remains a utility building. The two farmer parcels include their separate authored terrain GLBs; the house is grounded on the empty centre of its yard using a downward ray.

Source models remain in `Assets/Houses/`. Generate the game copies with `pnpm assets:houses`; an optional first argument selects a different Houses source directory. The default imports from the user's iCloud Houses directory, falling back to the local source path for files only available locally. The script also supports `HOUSING_ASSET_ONLY` to rebuild one named manifest entry. Runtime files and provenance live in `public/game-assets/houses/` and are ignored by Git. A new checkout needs the source files and this preparation step.

Textures are resized to at most 1024 pixels and encoded as WebP. Colour maps use quality 85; normal and material maps use lossless encoding after resizing. Meshopt compresses geometry. Original authored material values are retained; the old scenery palette treatment does not tint generated housing. Houses retain their source triangle counts. The high-resolution Homestead yard is simplified with relative error .005 and a target of 20,000 triangles; its topology and error bound result in approximately 45,600 triangles.

Current runtime sizes: Hut 2.24 MB, Homestead 2.37 MB, Longhouse 2.40 MB, GreatHouse 2.63 MB, farmer Hut 2.65 MB, farmer Homestead 1.25 MB, Hut yard 2.76 MB, Homestead yard 2.84 MB. The Homestead yard source has 3,001,777 triangles and is 97.25 MB. All eight game assets total approximately 19.2 MB, compared with 196.6 MB of source assets.

SettlementLayout defines separated parcels and generous collision exclusions for the entire fenced farmyards. The ground, paths, forest clearing, resident movement region and camera were enlarged together. Shared parcel dimensions flatten the terrain beneath housing and keep instanced scenery outside the parcels. The initial camera focuses on the enlarged settlement. Residents currently remain outside complete farmyard exclusions; entering gates and working inside yards needs dedicated navigation later.

`houseAssetFor(size, occupation)` selects the available farmer variant at the same housing size and falls back to standard housing for unavailable variants. Fjord still uses fixed example parcels; its residents do not yet have household occupation assignments driving automatic house swaps. The separate simulation lab's occupation system is not connected to the Fjord visual scene.

The production build copies only the existing scenery kit from `Assets/Terrain`, alongside generated assets from public, so unused high-resolution housing sources and reference images are excluded from deployment.

Validation: `node --test tests/meshy-housing.test.mjs tests/navigation.test.mjs tests/touch.test.mjs`, then `pnpm build`. Housing tests check variant selection, separated parcels, all eight decodable GLBs, texture limits, retained colour maps, compact output size, footprint containment and bounds within 5 mm for unchanged housing or 75 mm for the simplified yard. Browser evidence in `artifacts/meshy-housing/` covers all models with 40 Meshy residents and records console errors. Software-rendered browser FPS is not a hardware performance measurement.

## Canonical settlement calibration and headings

In /fjord-play, each Longhouse clone is uniformly scaled to the actual loaded standard Homestead
height. Current source dimensions are approximately 9.425 × 4.000 × 5.787m (width, height, depth),
compared with the Homestead's 9.472 × 5.001 × 6.372m. The calibrated Longhouse is approximately
11.784 × 5.001 × 7.235m: equal height and about 24% wider. Calibration preserves proportions,
materials and the grounded pivot; it leaves source GLBs and preparation metadata intact.
The corrected clone fits a 15m canonical reservation, including arbitrary headings toward the campfire.

Ordinary permanent homes face the settlement campfire with their authored +Z entrance.
The target is the midpoint of the saved settlement bounds, independent of living population
or current buildings. Upgrades and save/load retain each position and heading; no Core RNG
is consumed. Active Farmyards retain the fixed 180° source-yard orientation, including their
terrain and fences. Removing the Farmyard function restores the inward-facing heading at
the same physical location. Tents retain their existing heading and grass.

The 15m axis-aligned reservations contain the complete rotational sweep of the largest
source dwelling. A 17m grid surrounds the middle place; it fits ten separate founding
households in the validated clearing. Farms retain their existing approximately 13m
physical yard, within that larger reservation. Paths connect permanent homes to the
campfire clearing, including the first home; they avoid tents, buildings and the fire ring.

See [settlement campfire](SETTLEMENT-CAMPFIRE.md) for the source asset, scale and save treatment.

Regression evidence: [housing scale and headings](qa/fjord-housing-scale/report.md).

Generated terrain overlays use a zero slope factor and fixed depth-unit offsets. This keeps
coplanar sand, rock and soil layers separate without pulling them through the authored Farmyard
floor when the camera zooms out. Terrain geometry and saved world heights remain unchanged.
Regression evidence: [Farmyard ground visibility](qa/farmyard-ground-occlusion/report.md).
