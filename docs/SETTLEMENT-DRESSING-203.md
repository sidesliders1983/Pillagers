# Contextual settlement dressing

Issue: [#203](https://github.com/sidesliders1983/Pillagers/issues/203), under
[#180](https://github.com/sidesliders1983/Pillagers/issues/180). This is the first
local props and village-edge cover slice, based on main `255ef2d`.

## Visible behavior

Occupied tents receive a small container group. Occupied ordinary houses can receive
containers and a side-wall fuel pile. A living woodworker's home uses the larger existing
fuel-pile scale; a fisher's home can receive the existing fish-drying rack. All other
occupations retain ordinary domestic dressing. House specialization does not assign a
resident occupation. Existing active Farmyards retain their authored props, fences,
planting and cattle surfaces without another decoration layer inside them.

With at least two occupied permanent homes, one ordinary home's free parcel corner can
host the existing decorative village well. It adds no water resource or usable building.
Any prop is omitted when its measured source bounds cannot fit safely. A growing village
does not gain a fake storehouse, duplicate campfire, livestock, garden harvest, workshop
production or unowned longship. Fishing detail follows the actual fisher's home; this
slice does not place solid cargo on freely walkable shore approaches.

Low grass groups, occasional low shrubs and small stone accents soften a subset of
parcel edges and existing nearby tree groups. Irregular, seeded clusters leave open gaps
and front approaches. The locked KayKit models keep their original geometry/atlas;
instance-owned materials moderate their brightness and follow the season. New cover has
no native shadow casting. Small stones stay below 0.18 m, grass below 0.4 m and shrubs
below 0.5 m. Full-size trees and rocks retain their canonical positions.

## Ownership and integration

- `src/fjord-play/SettlementDressing.ts` selects living household/work facts and plans
  deterministic owner/slot placements using actual normalized source bounds. Each owner
  has a separate visual random stream; Core RNG is never read or advanced.
- `src/fjord-play/SettlementDressingLayer.ts` caches the relevant layout/work facts,
  instances the original mesh primitives and owns only instance buffers and seasonal
  material copies. Source geometry, maps and original materials remain with AssetManager.
- `FjordPlay.ts` reconciles the layer beside world and actors. Generic nature clearing,
  entity picking, selection bounds, ground wear and path caches do not own these objects.
  World replacement and page disposal release the layer before AssetManager.
- Solid props fit inside existing non-walkable, non-Farmyard parcels, outside source
  walls, doors and approach corridors. Terrain support checks cover the complete rotated
  footprint, not only the pivot. Wet, steep or uneven support is rejected. Paths are tested
  as segments, including the space between sampled points.
- The layer receives the player's projection and own household facts. It does not read
  CPU clan state or add rival household props. Unknown terrain hides all new dressing;
  mapped terrain can show only environmental cover, never live occupation/household props.
- Stocks, age and ordinary births do not invalidate the plan. Work changes, moving,
  vacancy, construction, upgrades and salvage reconcile the affected arrangement. Season
  changes update materials without rebuilding geometry. Discovery changes filter the cached
  plan and replace only batches whose selected instances change.

No gameplay rules, save format, recipe version, geography, canonical navigation or tree
targets change. Existing saves acquire the presentation layer when opened. The independent
home/rival ground caches from #202 remain intact.

## Rendering limits

| Quality | Maximum solid props | Maximum cover instances | New prop shadows |
| --- | ---: | ---: | --- |
| Low | 40 | 160 | Off |
| Standard | 64 | 320 | Existing directional shadow map |

Low selects a stable subset of the same plan. Batching uses eleven already-loaded asset roles,
each currently one primitive/material. The upper limit is eleven color draws plus five
Standard prop shadow draws, without a new pass, light, transparent overlay or texture.
The grass/shrub/stone budget limits geometry as well as draw calls: instancing is not a
claim of zero GPU cost. Actual visible counts and all-pass costs are recorded in the
[QA report](qa/settlement-dressing-203/README.md).

## Reproduce and review

Run the ordinary `build`, tracked public validation, explicit character validation and
test suite. There is no project formatter; manually review the existing four-space style
and run `git diff --check`.

The opt-in QA server and runner use existing tooling; production has no capture clock,
stock injection or browser audit API. Example in PowerShell:

```powershell
$env:QA_PORT = '5197'
$env:QA_GOLDEN = '1'
node scripts/qa/fjord-runtime-server.mjs
```

In a second terminal, set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is
not on Node's search path, then:

```powershell
$env:QA_ORIGIN = 'http://127.0.0.1:5197'
node scripts/qa/capture-settlement-dressing.mjs --profile
```

Restart the QA server after source edits; the frozen server does not use HMR. Use a fresh
output for a changed production source revision. Optional `--resume` requires identical
production source fingerprints.

The runner covers campaign seeds 17 and 32 (both curated island geographies), normal
landing stock, a normally paid two-house village, labelled developed QA stock, Summer,
Winter, Low/Standard, close and overview cameras. Before/after comparisons hide/show
only the new root and assert identical Core, blueprint, actor pose, camera, calendar and
lighting hashes. Running orbit samples report CPU/GPU distributions, dressing sync
costs and attributed spans. Ten quality cycles check retained geometry/texture/instance
counts. They are native desktop Edge measurements, not physical iOS validation.

## Remaining work

The owner accepted the first local dressing slice and PR #206 was merged. This slice
does not complete the broader #180 reference gap. The follow-up [village nature composition](VILLAGE-NATURE-203.md) introduces a pinned v2
campaign recipe for tree groups, while saved v1 recipes retain their exact terrain, tree
targets and navigation. Large rocks retain their canonical placements.
Observed rival domestic dressing needs its own public-facts contract. Large coastal cargo
or additional communal furniture needs a real reserved footprint before it can obstruct
walking. Existing activity animation, cultural events, apprentices, new fauna, vehicles and
trade keep their own gameplay scope.
