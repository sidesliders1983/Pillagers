# Livestock v0.1C — supplied model integration

This is the presentation slice of #220 under #217. The owner's reference to
#212 identifies the already merged scene lifecycle work; the requested animal
models are integrated above the existing #218/#219 livestock contracts.
The candidate founding/balance rules are not activated by this change.

## Available assets

| Species | Young | Young Adult / adult female | Young Adult / adult male |
| --- | --- | --- | --- |
| Cattle | Existing calf | Existing young-adult / cow | Existing young-adult / bull |
| Goat | Supplied kid | Supplied doe | Supplied buck |
| Sheep | Supplied lamb | Supplied ewe | Supplied ram |
| Pig | Deferred by owner | Supplied sow | Supplied boar |
| Chicken | Deferred | Deferred | Deferred |
| Goose | Deferred | Deferred | Deferred |

Only cattle have a separate Young Adult mesh. Other supplied juvenile-adult
stages use their sex-specific model; the stage and age shown in details still
come from Core. Deferred animals remain canonical and manageable in the roster;
they are not depicted with another species, or with a scaled adult piglet.
Their actual occupancy still counts when projecting yard/overflow placement.

The eight new models retain their supplied surface geometry, UVs, textures,
27-joint skins and sex differences. Runtime copies use uniform metre scaling,
WebP textures and Meshopt compression. Originals in iCloud are read only.
`public/game-assets/livestock/` contains the distributable copies. The owner
excluded the incorrect 200,958-triangle piglet download; it is neither simplified
nor published. Chicken and Goose remain later work.

## Activities

Goat, Pig and Sheep expose baked `Idle`, `Walk`, `Graze`, `Rest`,
`HumanInteraction` and `Death` clips. Walk retains the supplied cycle duration
and observed hoof-lift order, with the trunk restored to its upright bind pose
and planted-hoof IK baked offline. Runtime movement uses the clip's recorded
ground speed. It performs no per-frame IK or biological updates.

Grazing bends the available pelvis/chest/head chain with planted feet. Rest
settles the body with folded legs and rises again; grazing and rest alternate
between normal walks. Nearby human encounters reuse the existing reservations
and safe spacing. These are limited rigs without an independently verified jaw;
feeding uses head motion. All existing cattle activities remain in use; cattle
gain `Death` and retain their quiet standing rest.

## Death presentation

Only a confirmed canonical death or slaughter can start Death on a body already
present in the scene. A transfer, fog removal, model replacement or departure
does not count as a death. The animal immediately leaves selection, roaming,
production feedback and the live entity list.

The existing rendered body falls once for 2.4 seconds, stays on its side for
2 seconds, then fades over 5 seconds. Death does not loop or stand back up.
The fade owns cloned materials; it cannot change another animal or an asset
template. Active presentation time follows the running clock: pause also holds
the fall/fade. Completed animations, rollback and scene disposal release those
materials and the instance. Historical deaths are not replayed after reload.
Observed rival deaths obey the same visibility filtering; a body is removed if
its currently observed cell is lost.

There is no new Core death timing, mortality, slaughter reward, founding species
rule, saved flag or save schema. Names remain `Livestock N`; details retain the
real species, sex, stage, parentage and assignment.

## Review and reproduction

See [the local review](../qa/livestock-models/review.html) and
[the evidence report](../qa/livestock-models/report.md). The review includes
fixed-time pose controls and separate real Fjord campaign fixtures; fixtures use
explicit existing trial rules and extra initial Materials for a real Farmyard.
They are not shipping defaults or livestock-balance measurements.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare-livestock.mjs C:/Users/Devoteam/iCloudDrive/Pillagers/Characters/Livestock
node scripts/qa/prepare-livestock-model-review.mjs
node --test tests/livestock-presentation.test.mjs tests/livestock-species.test.mjs
pnpm run build
```

The cattle extension uses the four published reference models from local
revision `37e8ba72e2b0127806097a886966758df1991998` as explicit immutable inputs.
`assets:cow` also appends Death when republishing the original Blender authoring
exports. Original authoring sources remain outside Git; runtime assets and
manifests under `public/` must be checked in together.
