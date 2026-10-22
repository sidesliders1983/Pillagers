# Livestock v0.1C — models and herd information

This is the presentation slice of #220 under #217. The owner's reference to
#212 identifies the already merged scene lifecycle work; the requested animal
models are integrated above the existing #218/#219 livestock contracts.
The candidate founding/balance rules are not activated by this change.

## Available assets

Coats reflect the same scene light as the settlement. Imported emission is disabled
on cached livestock templates; the goat, pig and sheep exports previously carried
white self-emission that stayed bright in northern darkness. Future livestock
exports clear that factor as well. Albedo, rigging, animations and Core are unchanged.

| Species | Young | Young Adult / adult female | Young Adult / adult male |
| --- | --- | --- | --- |
| Cattle | Existing calf | Existing young-adult / cow | Existing young-adult / bull |
| Goat | Supplied kid | Supplied doe | Supplied buck |
| Sheep | Supplied lamb | Supplied ewe | Supplied ram |
| Pig | Supplied piglet | Supplied sow | Supplied boar |
| Chicken | Deferred | Deferred | Deferred |
| Goose | Deferred | Deferred | Deferred |

Only cattle have a separate Young Adult mesh. Other supplied juvenile-adult
stages use their sex-specific model; the stage and age shown in details still
come from Core. Deferred animals remain canonical and manageable in the roster;
they are not depicted with another species or with a scaled adult as a baby.
Their actual occupancy still counts when projecting yard/overflow placement.

The nine new models retain their supplied surface geometry, UVs, textures,
27-joint skins and sex differences. Runtime copies use uniform metre scaling,
WebP textures and Meshopt compression. Originals in iCloud are read only.
`public/game-assets/livestock/` contains the distributable copies. The owner
replaced the incorrect 200,958-triangle piglet download with a 2,808-triangle
model. The replacement is published without geometry reduction; the incorrect
download was never published. Chicken and Goose remain later work.

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

## Herd information and returned livestock (#220 owner amendment)

The Livestock directory, animal details and Farmyard details expose a read-only
`Breeding stock` summary. Combinations require the same species and actual herd
location. Age-eligible combinations are distinguished from young possible
replacements, animals past the breeding window, birth intervals, actual space
and the same-boundary feeding guard. These values reuse the birth resolver's
canonical predicates; they are not saved flags or a second biological model.
No inbreeding rule is introduced. A pair is not a guarantee of a successful birth.

Slaughter remains available with its existing costs/rewards and confirmation.
The confirmation warns when its actual preview removes the last age-eligible
combination for that species in that herd; a young possible replacement is
identified separately. This is advice, not a new automatic slaughter policy.
Mixed Farmyard occupancy continues using each individual's species weight.

Returned Pillage reports link the actual recovered animals to their cards.
Cards distinguish current age/breeding status from the immutable recorded
identity at return and expose factual capture history. No recovered animals
means no livestock was recovered; the UI does not invent a reason.

Loot remains the first living animal in sorted-ID order, with no targeted sex,
age or species selection. The donor owns and simulates the animals until actual
return; transfer preserves IDs, species, sex, birth, parents and progress.
Assignment uses the existing commands. Founding species exclusion and all
livestock coefficients remain unchanged. New ordinary Explore starts include
the approved #231 eight-Food pack; Recon/Pillage fees are separate and unchanged.

See [the integration evidence](../qa/livestock-integration-220/report.md) and
[interactive returned-raid review](../qa/livestock-integration-220/review.html).
The frozen 360-campaign study is reused as historical evidence, not rerun or
relabelled. Island 18's mission search limit remains a separate dependency;
Chicken/Goose meshes and physical-device acceptance remain outstanding.

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
