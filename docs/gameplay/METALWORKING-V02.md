# Metalworking v0.2 (#224)

The two owner-approved iron items extend the existing personal Weapon and Shield
inventory. Leather Body Armor and Iron Helmet belong to the separate
[personal armor follow-up](https://github.com/sidesliders1983/Pillagers/issues/333), not this catalogue version.
The earlier [Smithery v0.1](SMITHERY-V01.md) rules remain the historical baseline.

## Approved playtest balance

The owner approved these trial values on 13 November 2026. Normal aptitude,
learned proficiency, care, absence, adulthood, household specialization and work
progress continue to determine actual output.

| Item | Worker | Inputs per finished item | Items/Winter at 100% productivity | Wearer effect |
| --- | --- | --- | --- | --- |
| Iron-tipped Spear | Smith | 2 Materials + 1 Iron Ore | 2 | +15% on-site attack contribution |
| Iron-reinforced Shield | Smith | 4 Materials + 2 Iron Ore | 1 | 50% reduction of its wearer's casualty risk |

The baseline Wooden Spear uses a +10% on-site contribution. Wooden and
Leather-reinforced Shields retain their saved 25% and 40% protection rules.
An iron spear still has a wooden shaft; the iron shield is a wooden board with
iron fittings. No all-metal shield, item tier stacking or automatic upgrade is
implied. The existing recipes produce fresh finished items; they do not also
consume or duplicate a wooden item.

## Production and resource conservation

The existing Smithery panel exposes stock targets, recipes and actual availability.
Selecting a target spends nothing. An eligible Smith consumes the exact recipe
once when normal work finishes one whole item. A missing ingredient blocks that
recipe; another needed affordable recipe may still use the shared work loop.
Targets include stored and personally assigned items, including carried-away gear.

Iron Ore comes only from real worked deposits or bog iron through the existing
Mining system. No generic Materials conversion, trade purchase, free stock,
intermediate ingot/fuel resource or global HUD bar is added. Mining conservation
requires extracted ore to equal current ore plus the ore spent in versioned,
factual EquipmentCrafted receipts. The new catalogue also accounts for each iron
item as stored, assigned, or factually lost. Invalid receipts, unexplained ore and
unexplained finished stock fail save validation.

## Versioned ownership and outcomes

Loading a campaign does not rewrite its Smithery v1 catalogue or past missions.
The first prospective iron stock target adopts Smithery v2, appends zero iron
counts, retains the saved wood/leather rules and records MetalworkingAdopted.
Equipping still moves one actual item between storage and one named person at
home. There are still exactly two slots in this slice. Away residents and those
on mining or territorial duty cannot receive replacement gear.

New dispatches freeze the actual holder's gear and applicable coefficients.
Snapshots without iron retain the previous version and evaluation path. Existing
historical mission facts are neither reconstructed nor re-rolled. Survivors keep
their items; on-site deaths lose the carried items permanently. Home death and
transfer return clan property through the existing ownership rule.

On-site combat applies the spear modifier to that person's existing contribution
and the shield modifier to that person's existing risk calculation. No separate
resolver, damage model, hitpoints, animation-driven damage or RNG stream is added.
The older abstract Pillage adapter retains its additive averaged-spear contract:
its success basis points are base success plus the crew-average spear bonus,
capped at 10,000. At a 65% base, a fully wooden-spear crew gives 75%; a fully
iron-spear crew gives 80%. This is distinct from the on-site contribution formula.
Wood-only behavior and RNG order remain unchanged.

## Supplied native assets

The actual owner-supplied Meshy sources are prepared through the same
[native equipment pipeline](VISIBLE-EQUIPMENT-V1.md), without a new rig or renderer.
They retain source triangles and UVs, with 1024px albedo and 512px PBR maps.
Original source GLBs remain outside public output. Source IDs, byte hashes,
measurements, rights evidence and fitted output hashes are recorded in the
source manifest and per-asset provenance. Owner-provided authorization is not a
claim that the files have a verified CC0 or other public redistribution license.

Iron variants use the real native right-hand spear and left-forearm shield
attachments, the normal field tunic and the existing body-clear combat poses.
World and Character Card presentation reflect actual canonical assignments.
Development-only Character Lab choices do not manufacture or equip campaign stock.
Fit/visual review status remains explicit until combined owner QA accepts it.

## Validation scope

Public Core commands, real mining/crafting, save/load and ownership events cover
resource and item conservation. Matched seeds compare wearer-specific offense and
protection while retaining the original actor order and RNG stream. Actual native
geometry checks and complete action views cover iron grip, forearm contact and
body/clothing clearance. Desktop evidence and physical-device acceptance are
reported separately; viewport emulation is not a phone performance pass.
