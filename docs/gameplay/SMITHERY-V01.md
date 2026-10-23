# Smithery v0.1 — personal raiding equipment (#221)

This slice uses the existing Smith (`smith`) and Leatherworker
(`leatherAndJewelleryMaker`), work progress, care/age/away restrictions and home
specialization upgrades. No mine, new workplace building, training XP, body armor,
durability or second combat resolver is introduced.

## Smith house appearance

The existing house specialization selects the supplied Smith Hut at upgrade level 0
and Smith Homestead at level 1. Longhouse (level 2) and Great House (level 3) retain
their standard models until dedicated Smith versions are supplied. Changing a
resident's occupation alone does not specialize the building. A household with a
Farmer retains its real farmyard and livestock capacity even when its home uses the
Smith specialization; no new workplace, cost or production bonus is introduced.

Runtime publications preserve the authored metre scale and original textures,
using the existing 1024px WebP/Meshopt pipeline. Originals remain outside public/.
Both variants use the existing construction reveal/fade and seasonal snow treatment.
Existing window emission masks are unchanged; unreviewed door details are not made
self-lit.

## Production and ownership

| Product | Worker | Actual inputs per finished item | Items/Winter at 100% effective productivity |
| --- | --- | --- | --- |
| Wooden Spear | Smith | 2 Materials | 4 |
| Wooden Shield | Smith | 3 Materials | 4 |
| Leather-reinforced Shield | Leatherworker | 3 Materials + 1 Hide | 2 |

A normal Winter is 1,000 ticks; the ordinary work threshold is 10,000,000 integer
work units. Inherited aptitude, tent productivity, age, career changes and existing
matching workplace upgrades modify effective production in the same work loop.
Caregivers, absent or deceased residents and those below working age do not craft.
The recipe step abstracts hide processing. It consumes inputs only when an item
is completed, never on target selection; no wooden shield is also charged for the
direct leather-shield recipe. Crafted Materials spending is part of the Clan Book ledger.

Targets are whole counts from 0 to 20 for each item. They count **stored plus worn**
clan property, including away gear. Work stops at the target or missing inputs.
Smiths consider spears before wooden shields, using another needed affordable
recipe when the first is blocked. Multiple workers cannot overrun the shared target.
Existing per-occupation fractional work is retained; unpaid whole items cannot be
banked after inputs or a target run out. Lowering a target never destroys existing gear.

Each eligible real resident has exactly **Weapon** and **Shield**. Equipping moves
one real item from stored stock to that person; replacing/removing gear returns
the old item to storage atomically. There are no item UUIDs, pooled party equipment,
automatic allocation, automatic upgrades or equipment teleports to away residents.
Targets may replenish genuinely lost equipment through ordinary paid work.

Hides reuse the existing specialist stock and species-configured real slaughter
output from livestock v0.1B: the current rules award one Hide for eligible adult
cattle, pigs, sheep and goats; poultry yields none. Natural deaths and historic
slaughter records yield none. Food, animal identity/ancestry and the existing
slaughter action remain authoritative. No Hide resource is added to the global HUD.
Historical livestock-rule versions keep their saved yields; no old records are replayed.

## Pillage snapshot and approved coefficients

At dispatch, both graph and physical Pillage freeze each participant's ID, recorded
name, Weapon, Shield and casualty probability, plus the baseline and applied
coefficients and final success probability. Offers are pure previews. Subsequent
production, target changes or saved config changes cannot rewrite a dispatched raid.
The mission confirmation rejects a changed crew, gear snapshot or offer.

The owner explicitly approved these values on 23 October 2026 after the matched-seed
comparison in [the measurement](../qa/smithery-221/matched-seeds.json):

- Success = base Pillage success + floor(1,000 basis points × spear holders / crew),
  capped at 100%. The usual unarmed baseline stays 60%; all spear holders reach 70%.
- Wooden Shield: its wearer's existing casualty risk × 75%.
- Leather-reinforced Shield: its wearer's existing casualty risk × 60%.
- Weather remains in the existing base casualty probability before personal protection.
  At the normal 10% baseline this means 10%, 7.5% and 6% individually.
- Recon, Surveillance, Explore, provisions, no-refund policy and loot capacity are unchanged.

The existing shared resolver still rolls each living member's casualty in the same
order, then mission success if any member survives. No new RNG stream or extra roll
is introduced. Historical missions without equipment snapshots use their exact
saved common risks and success chance.

Survivors keep their assigned gear on homecoming, including after an unsuccessful
or recalled mission. Death while away permanently loses carried gear; there is no
refund or free replacement. The resolving expedition explicitly identifies that
loss, even when its physical mission has already reached `Returned`. The
`EquipmentLost` event identifies the same mission and items as the immutable return
report; those items never return to inventory.
Death at home returns the clan's gear to storage, including after an earlier raid.
On a persona transfer, equipment remains property of the source clan and is returned
to that clan's store; DNA, experience and identity still transfer through the existing
mechanism. Returned/lost raid equipment is recorded against the immutable snapshot.
Save validation rejects detached away assignments or altered return reports.

## UI, history and compatibility

An existing Smith/Leatherworker home or resident opens **Crafting & equipment**.
It shows real Materials/Hides, stored/worn totals, targets and actual workers' status.
Expedition mission preparation has named Weapon/Shield selectors, available stock,
wearer-specific risk and derived group success. The return report distinguishes gear
returned with its owner from permanent losses. Native 3D item attachments are a later
visual follow-up; the headless state and consequences are complete without new meshes.

New campaigns initialize empty saved Smithery state for player and CPU clans using
the same factory. Old saves retain absent Smithery state and historical mission
semantics. Setting a prospective production target explicitly initializes empty state;
it invents no gear, Hides or historical crafting. New factual events are
`EquipmentTargetSet`, `EquipmentCrafted`, `EquipmentAssigned`, `EquipmentLost` and
`EquipmentRecovered`; Chronicle and personal history use the recorded names and costs.
There is no per-tick crafting event and no invented duel, attacker or battle action.

## Verification

Run `node --test tests/smithery*.test.mjs` for production, integer spending, real
slaughter, mixed allocations, absence/care, ordinary workplace upgrades, transfer,
loss, physical dispatch/cancellation, save/split replay and desktop/mobile DOM controls.
Reproduce the balance comparison with:

```text
node scripts/calibrate-smithery.mjs docs/qa/smithery-221/matched-seeds.json
```

The four 10,000-seed scenarios measured 60.00%, 65.01%, 69.98% and 69.99% success
(none, partial, all wooden, all leather shields). Individual casualty frequencies
were 10.0625%, 7.7975%, 7.5525% and 6.0100%. These are observations for the stated
fixed cohort and no-weather conditions, not guaranteed outcomes in every campaign.
The next roadmap step is #222 Apprenticeship, then #223 Mining and #224 Metalworking;
none of those additional systems is enabled by this PR.
