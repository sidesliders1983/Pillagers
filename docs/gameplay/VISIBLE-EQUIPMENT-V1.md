# Visible personal equipment v1 (#309)

The existing Weapon and Shield assignments select each real resident's visible
props. The first catalogue contains Wooden Spear, Wooden Shield and
Leather-reinforced Shield. Both, either item, and neither are valid. Opening a
world, Character Card or Family Tree portrait does not craft, equip, spend or
change the saved simulation. Recipes, protection, combat and ownership still
belong to [Smithery](SMITHERY-V01.md) and [on-site encounters](ON-SITE-ENCOUNTERS-V1.md).
Leather gear in this catalogue is a shield. No armour, helmet, new inventory slot
or protective statistic is introduced.

## Wardrobe and actual items

Exploration parties and actual combatants, including mobilised defenders, use the
existing fitted tunic/trousers and low shoes underneath their actual gear. They
keep their face, body, hair and beard; occupational hats and tools are removed.
Watch/warning duties retain ordinary work clothes until mobilisation or combat.

At home, a worker restores the existing work garments and tool. A conflicting
assigned item is stowed visually while that tool occupies its authored hand; it
remains owned and assigned. An actual personal item in the opposite free hand can
remain visible. Departing removes the tool and exposes the assigned combat items.
No role, mission type or group average creates a phantom spear or shield.

The generic tunic and low-shoe source bindings are numerically qualified for
eligible field bodies aged sixteen and seventeen, for both sexes, with their
actual Child weights. Their geometry is unchanged. Civilian clothing below
eighteen and hair/beard age rules retain their existing contracts. The
[qualification](../qa/visible-equipment-309/teen-clothing-measurements.json) records
age-eighteen controls, native coverage, posed vertex and sleeve-stretch checks;
it is not whole-garment penetration certification or visual owner acceptance.

## Supplied source props and native carry

| Canonical item | Native review asset | Existing native hand |
| --- | --- | --- |
| `woodenSpear` | `equipment/native-wooden-spear` | `socket_hand_R`, joint 24 |
| `woodenShield` | `equipment/native-wooden-shield` | `socket_hand_L`, joint 11 |
| `leatherShield` | `equipment/native-leather-shield` | `socket_hand_L`, joint 11 |

The owner supplied the three actual Meshy source models through Drive. Preparation
preserves their source geometry and UVs, optimizes embedded textures and records
source/output hashes, measurements and native bindings. Original multi-megabyte
files stay outside `public/`. Runtime files and provenance are under
`public/character-lab/modules/native-combat-equipment/`; the reproducible inputs
are in [the source manifest](../../scripts/characters/native-combat-equipment.sources.json).
The props remain `preview` assets pending combined owner fit review. No scenery
shield extraction, replacement sword, new generation or paid generation is used.

Independent rigid modules share the resident's existing 44-bone skeleton and
measured native hand/finger grips. They do not mask or replace the tunic. Native
Idle/Walk/Run carry posing reuses the existing clock; combat action authoring and
its arm/finger precedence are the next animation slice (#310).

## Reconciliation, portraits and privacy

The native presentation contract adds optional `equipmentItems`, containing up to
two distinct additional hand modules. Existing scalar `equipment` and
`equipmentSocket` payloads retain their meaning. Explicit duplicate/same-hand
stacks are rejected before installation. Fitting and source reads run on actual
appearance/loadout changes, not animation frames. World quality settings retain
the existing native body LOD2 and each registered prop's runtime LOD policy.

Portrait inputs and source keys include every selected item and its verified
binding. Fjord portraits reuse the existing renderer and matching prepared rig.
When personal gear is visible, the small header uses a deliberate head/chest crop
with actual shield and hand/shaft references, preserving a recognisable person.
Long prop extents may leave that frame; the model itself remains complete. An
explicit `equipment-full` QA frame includes both complete props and the head.
Selecting a portrait restores the borrowed world model and render state.
No additional persistent WebGL context or per-resident renderer is introduced.

Rival bodies retain the existing per-body line-of-sight filtering and anonymous
identity. Only actually carried personal item types pass that boundary; a stowed
assignment does not reveal hidden inventory. Mapped geography alone does not
preserve an actor or its loadout after it leaves sight.

## Verification and remaining acceptance

Run `node --test tests/visible-equipment.test.mjs tests/native-combat-equipment.test.mjs`
for real crafted allocations, source/native carry, work/field transitions,
qualified teen clothing, Character Card cache/unequip, same-renderer framing and
rival visibility. Existing clothing, portrait, Lab snapshot and Smithery tests
remain compatibility checks.

Source provenance and software fitting checks are distinct from visual approval.
Actual front/side/rear world and portrait captures, severe clipping/grip review,
comparable draw/frame-time measurements, physical iPhone checks and new authored
combat-pose checks remain part of the combined combat QA. Viewport emulation does
not replace a physical-device pass.
