# Mining v0.1

Mining is enabled for new physical island campaigns after owner UAT approval on
2026-10-28. Historical saves retain their original geography and rules: importing
or continuing a campaign never adds deposits. Replaying the same founders keeps
that campaign’s saved ore plan; starting a fresh campaign uses the current plan.
The existing ten-island campaign pool is retained. The twelve exported research
islands are separate files and are not added to the shipping pool.

## Finite natural outcrops

The version 1 ore plan is derived from the final WorldBlueprint terrain,
rock exposure, moisture, navigation and scenery. No second landscape or random
stream is introduced. Deposits favor elevated exposed slopes with a safe nearby
standing point. Both settlement reservations have a 20 m buffer. Prototype rules
allow up to four sites, at least 110 m apart, at least 8 m above water, rock
exposure at least 0.35 and approach slope at most 0.55. Initial reserves range
from 32 to 96 integer Iron Ore, derived from exposure. Moisture above 0.8 is
excluded. There are at most 64 bounded canonical route searches per proposal.
These owner-reviewed coefficients apply to newly created physical campaigns.

Sites are generated before discovery. Neither visits nor save/load replenish
reserves. A known outcrop has no numeric assay until a real Miner reaches it.
Unknown sites have no rendered mesh, selectable target, label or contextual
projection. Iron Ore appears in Mining and Smithery details, alongside Hides;
Food and Materials remain the general resource HUD.

## Actual residents and work

Select a discovered outcrop in the 3D scene and assign an eligible adult resident.
The transaction assigns the existing canonical Miner occupation, then plans an
eight-way land route around actual scenery and settlement plots. Invalid starts
are atomic. At the prototype speed of 2 m/tick the resident runs to the approach;
no ore is produced at home or while traveling. A blocked trail pauses movement
and extraction and retains a reason. Development is attached to that same outcrop; no household or individual RTS
movement is introduced.

At the site, a developed mine has candidate output of 8 units/year at 100%
effective productivity. The owner-approved trial update charges **20 Materials**
once to develop a known outcrop. Materials are the existing shared wood/building
stock; no separate Wood currency is added. Undeveloped outcrops have **50%**
productivity. Development retains the same site, finite reserve, workers and
partial work; it introduces no replacement ore. `MineBuilt` records the payment.
The supplied timber-and-stone entrance distinguishes a developed mine in the scene.
Its doorway faces a level earthen forecourt; the rear section intersects the local
hillside. A bounded local orientation search keeps the doorway exposed without
changing saved terrain, the canonical workplace or navigation. The Miner uses
render-only foot support on the forecourt. Nearby visual vegetation is cleared
through the existing structure-footprint API.

The runtime model retains all 6,731 triangles, normals and UVs. It is 1,451,832
bytes with 6 MiB of unpacked RGBA texture pixels (about 8 MiB including mipmaps),
compared with 23,927,404 bytes and 96 MiB in the source. The scene downloads and
checks it only after a known mine is developed. Instances share the decoded
geometry/textures, have instance-owned seasonal materials, and release resources
on scene disposal. Unknown and bare outcrops never trigger this model download.
The original asset under `Assets/Mining` remains unchanged and is not published.

Assign through either the selected outcrop or the resident’s **Assign mining
site** action. Becoming a Miner opens known-site selection. No hidden sites are
listed. These actions use the same atomic session transaction as other management.
Older unpublished Mining QA saves migrate their policy metadata to revision 2 at
load, keeping their time, RNG, stocks and past events. Non-Mining historical saves
remain unchanged.
The existing DNA aptitude, age, shelter, career-switch penalty, parental
occupation history and apprenticeship modifier determine actual work progress.
There is no additional skill or training currency. Miners keep the ordinary
resident food requirement; they do not receive a free expedition ration.
Working away excludes them from expedition departure, cultural attendance and
new partnership/conception evaluations. Their saved occupation history is kept.

Recall or a changed occupation/care obligation makes the worker walk back along
the reached trail. The resident cannot produce another resource on the way home.
Exhaustion starts the same homeward journey. Death stops the assignment without
respawning the worker. Worker IDs resolve simultaneous extraction in stable
order. Each extraction debits the site once and credits that clan’s Iron Ore
once, with a factual `IronOreExtracted` event containing miner, site, clan,
quantity, reserve and canonical time. There is no per-tick extraction event.

The player’s explicit mining extension does not appoint CPU Miners, grant CPU
Iron Ore or copy its reserve into a second clan inventory. No refining, ingots,
coal, recipes, market purchases, tools buff or Bog Iron rule is added.

## Saved campaigns and island selection

The immutable ore proposal belongs to the saved physical world; Core owns its
remaining reserve, assessment, worker paths and work progress. Binding requires
new-campaign founding time and matching discovery/world identity. Rebinding
cannot restore reserves. Import verifies the canonical proposal and exact world
identity; loading old campaigns never adds mining or changes geography.

The 12 new island files are authoring exports outside `public/`. They are
candidates for a future replacement selection. Suitable existing islands may
remain. The shipping pool is not automatically extended, and historical recipe
mappings remain immutable so old campaigns retain their exact terrain.

## Verification

Run `node --test tests/mining.test.mjs tests/mining-presentation.test.mjs
 tests/ore-sites.test.mjs tests/mining-assets.test.mjs` as one command (without the display line break).
The contracts cover actual paid exploration, assignment, travel, reserve
conservation, two-clan isolation, unassigned output, blockers, exhaustion,
recall, role changes, save/load and split advances, hidden information,
contextual controls, picking and bounded geometry disposal.

Run `node scripts/qa/survey-mining-islands.mjs` for the current pool. Run
`node scripts/qa/export-mining-islands.mjs <D-output-directory>` for resumable
new candidates with source and runner hashes. Its real pier, rival access,
founding projection and mining/save checks retain unsuccessful seeds as results.
Browser and physical touch review remain separate from these headless contracts.


Rebuild the runtime asset with `node scripts/prepare-mining-assets.mjs
D:/CodexSites/Pillagers/Assets/Mining` (one command). The generated manifest
records source/runtime hashes, triangle signatures and texture budgets.
`node scripts/qa/verify-mining-exports.mjs <export-directory>` verifies the
completed island bundle against its frozen protocol, source files and raw results.


## Wet Lowland and Bog Iron (same opt-in implementation)

Owner direction now includes this terrain-diversity extension. Version 2 Mining
proposals add a descriptive Wet Lowland overlay while retaining the original six
Biome values. It indexes existing environment cells; there is no second terrain
height field, wetland hydrology simulator or random stream. Candidates reuse
canonical moisture, mud, slope and the existing drainage valley corridors.

Current **QA candidate** thresholds: 0.6–12 m above water, slope at most 0.12,
moisture at least 0.60 and mud weight at least 0.22. Pockets have 4–16 existing
4 m cells (64–256 m²), up to four pockets at least 60 m apart, outside settlement
buffers. Not every seed qualifies. Connected peat/moss beds, sparse sedges and
shallow horizontal water in existing low ground follow the observing clan's
discovery mask. This is visual dressing: movement costs, navigation and canonical
terrain remain unchanged. At most 64 cells carry 256 procedural grass tufts and
32 shared Cattails. Together with peat and water they use at most four draw calls
and 30,000 triangles. The generated pattern is reduced to 256 by 256
pixels (19,896 bytes WebP; 256 KiB decoded, about 341 KiB with mipmaps). Snow uses
existing structure tint; ripples stop while the campaign is paused. The shared
texture loads only after a wet pocket is discovered and is released with its scene.
Water covers the flat interior instead of forming only a puddle at the lowest edge.
Each discovered pocket uses one horizontal surface, 12 cm above the upper quartile
of its flat interior samples (slope at most 0.08). Ground above that level stays dry;
patches without flat samples retain only a small low-point pool. This is presentation,
not a new water level in Core or a change to movement or mining.

Marsh grass uses the existing MIT boona13 GrassField, with 0.90–1.15 m blades
instead of the ordinary 0.4 m. Cattails use the selected Poly by Google model
(CC-BY 3.0): all 473 triangles retained, 41,916 runtime bytes, one 128-pixel
colour texture (64 KiB decoded, about 85 KiB with mipmaps). The public Game menu
links to Nature asset credits. Model loading starts only for a discovered pocket
with Cattail placements. A missing model leaves the procedural grass available.

Clumps use an independent deterministic presentation stream, root on canonical
peat, and occur in shallow water and at wet edges with open water between them.
They are decorative and cannot intercept clicks. Visible marsh wind uses the existing active
clock and pauses with the campaign; lighting, fog and snow follow the scene.
Scene replacement releases grass buffers, shared model resources and late loads.
The regular grass settings and all gameplay/discovery rules remain unchanged.

A deterministic subset of qualifying pockets may contain at most two finite
Bog Iron sites. Not every mud cell bears iron. A site must pass actual land route
and scenery checks; bad routes, absent deposits and exhausted sites stay results.
Use **one reachable source of either kind** as the island availability criterion;
a rock deposit and Bog Iron are not both required. This is not a promise that all
marshland contains collectible iron.

Bog Iron uses the same real Miner, travel, eligibility, ordinary Food needs,
aptitude, finite reserve accounting and **Iron Ore** specialist stock. It has no
new currency, refining step or HUD counter. The current natural-collection trial
uses the existing undeveloped 50% rate and reserve range 32–96, derived from the
existing mud weight. There is no rock entrance to build in a bog; the existing
20-Materials development action remains specific to rock outcrops. These are
explicit prototype coefficients pending owner review, not new shipping defaults.
Extraction events record their real rock/bog source and exact site.

Saved v1 rock-only proposals retain their exact data. Loading them never appends
wetlands or ore. New v2 proposals store and validate the overlay, source identity
and reserves against canonical geography; tampered cells/links are rejected.
The v3 rock-only island measurements remain historical; v4 rechecks the same
twelve selected seeds using the extended protocol. It does not silently reuse the
old Core proof as evidence for the new source rules.

## Mine occupants and winter light

A Miner working at a developed rock mine is inside and is not rendered. The
worker stays visible during travel and reappears when returning. Bare outcrops
and Bog Iron retain visible outdoor work. Hiding an occupant changes no Core
travel, work, eligibility, costs or saved state. Hidden occupants have no floating
production indicator.

Developed mines show warm shaft spill and a small emissive cylinder inside the
authored exterior lantern in winter. Each uses one local light without shadows
and 28 extra triangles, with the existing seasonal transition. Other seasons
leave the lantern and shaft unlit. Lights and materials are released with the mine.

The ordinary Fjord grass clumps remain static scenery. This marsh adapter is the
first connection of the existing procedural grass shader to Fjord Play; it does
not imply that all previously placed grass now animates.
