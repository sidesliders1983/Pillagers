# Village-edge trees and nature

Follow-up to merged PR #206, under [#203](https://github.com/sidesliders1983/Pillagers/issues/203)
and [#180](https://github.com/sidesliders1983/Pillagers/issues/180).

## Composition

New `/fjord-play` campaigns use `island-pool-v2`. Both curated island geographies keep their
exact terrain, coastline, zoning, foundations, campfire, berth and nature asset quotas.
The recipe redistributes a bounded part of the existing 102-tree budget into up to five
loose pockets of three trees around each settlement, with deliberate open gaps. Mature
conifers, smaller conifers and deciduous trees share those pockets. Wider forests retain
as much of the original distribution as fits the new reservations. A bounded habitat
search fills remaining slots; unsafe placements are skipped rather than forced.

Trees use the existing moisture, grass/forest and rock-exposure fields. Beaches, steep
slopes, water, exposed summits, future upgraded homes, the communal clearing, harbor access
and geographical connection routes remain protected. Original large rocks remain in place.
Every trunk is part of the canonical placement plan and navigation; there are no decorative
full-size trees which residents can walk through or which masquerade as new wood stocks.

The renderer reuses the pinned EZ-Tree/KayKit primitives and two already registered Terrain
models: `birch-tree.glb` for the deciduous role and `spruce-tree.glb` for the compact young
conifer role. Both are measured and scaled within the canonical height/radius, with the
existing role as fallback when a source is unavailable. The original source files, maps
and geometry remain unchanged; the distinct silhouettes use the existing asset pipeline. V2 trees have deterministic
width/height variation within their existing canonical clearance and a restrained set of
per-instance foliage tones. Rotation/scale do not alter source geometry. The native leaf
wind receives an independent world-position phase, while trunks remain fixed. Existing
wind controls and seasonal tint/frost continue to own motion and winter appearance.
Foliage snow classifies the original vertex colour before instance tints; textured pine
canopies without vertex colours receive full foliage coverage without any extra varying
or per-vertex mask work. Mixed vertex-coloured foliage passes one source mask float. Per-tree hue variation
therefore cannot accidentally suppress snow, while mixed birch/spruce bark keeps its
original source-colour mask.

The local dressing layer adds a second existing shrub silhouette and small-stone family,
slightly larger irregular groundcover drifts and more understory around local trees.
Occupied homes retain the already approved domestic props. Farmyard interiors, doors,
paths, cattle space and the fire clearing remain excluded. Cover stays below 0.5 m for
shrubs, 0.4 m for grass and 0.18 m for stones; it never becomes a navigation blocker.

## Save and simulation contract

`island-pool-v1` is supported as a pinned compatibility recipe. Its full blueprint hashes
are regression-tested against merged main `ce9b57c` for both curated geographies. Opening a
v1 save, importing it, resuming through the generation worker or restarting with the same
founders retains its original nature/navigation and tree targets. No automatic migration
or silent regeneration occurs. The richer groundcover and leaf phase are presentation
changes available to existing saves; the new tree layout and silhouettes require a new
campaign. Newly created campaigns and the new-campaign menu select v2 explicitly.

The recipe version travels through async worker requests and adoption. Cache keys include
version and geography seed, preventing a warmed v2 island from replacing a v1 restore.
Unknown versions and seed mismatches are rejected before committing a campaign. Core RNG,
stocks, occupations, build costs, simulation rules and character assets are unchanged.
Ordinary command traces are compared between recipe versions. The existing independent
home/rival ground caches and unchanged-tick dressing cache remain intact.

## Rendering limits and validation

The full-island tree quota does not rise. Local visibility and shadow/vertex costs can still
rise when a camera sees more trees; identical total counts are not an FPS guarantee. No new
models, textures, lights, passes, post-processing or dependencies are introduced.

Local decoration retains the existing Low limit of 40 solid props / 160 cover instances
and Standard limit of 64 / 320. Eleven shared source families bound it to eleven color
batches plus the existing five Standard prop shadow batches. Cover casts no native shadows.
Instance colors add one small per-instance attribute, not material/texture variants.

Run `pnpm build`, `pnpm validate:characters`, `pnpm test` and `git diff --check`. The project
has no formatter; follow the existing four-space style and manually inspect changed code.
The targeted tests cover v1 fingerprints, v2 quota/terrain parity, full future plot clearance,
real tree obstacles, both version round-trips/cache adoption/restarts, rejected versions,
Core command/RNG parity, moved-obstacle removal, shared source bounds and leaf-wind ownership.

The optional `scripts/qa/capture-village-nature.mjs` compares an unchanged main QA server
with the candidate server, using paid two-home villages on seeds 17 and 32. Both recipes
share terrain, camera, calendar, stock, resident roster and household facts. Tree placements,
navigation, discovery/world identities and derived actor paths intentionally differ between
these new-campaign versions and must not be reported as a full identical-world comparison.
Summer/Winter, Low/Standard, normal play distance and woodland close-ups are captured.
Optional `--profile` records CPU/GPU distributions and verifies zero warm-tick plan/batch
rebuilds. Ten quality cycles check retained geometry, textures and instance counts. Browser
measurements are desktop evidence; they do not certify physical mobile thermal performance.

Results and visual acceptance are recorded in the accompanying QA report before delivery.

For a renderer-only recapture, `QA_REPLAY_ROOT` can point at a previous successful capture
directory. The runner reuses its canonical saves/cameras, but still loads the real game and
asserts exact full blueprint/navigation and Core/RNG hashes against that earlier run.
