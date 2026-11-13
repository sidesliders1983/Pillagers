# Personal armor v0.1 (#333)

This contract extends the [Metalworking v0.2](METALWORKING-V02.md) catalogue with
one Body Armor slot and one Headgear slot. It is an explicitly versioned
follow-up; the earlier two-slot Smithery and mission records retain their rules.
Each armor slot now offers two mutually exclusive variants; no extra slot is added.

## Owner-approved playtest rules

The owner approved these values on 13 November 2026. Recipes use the existing
craftspeople, real specialist stocks and ordinary work progress.

| Item | Slot | Worker | Inputs per completed item | Items/Winter at 100% productivity | Personal protection |
| --- | --- | --- | --- | --- | --- |
| Leather Body Armor | Body Armor | Leatherworker | 3 Materials + 2 Hides | 1 | 20% |
| Iron-reinforced Body Armor | Body Armor | Smith | 3 Materials + 2 Hides + 2 Iron Ore | 1 | 30% |
| Leather Helmet | Headgear | Leatherworker | 2 Materials + 1 Hide | 1 | 5% |
| Iron Helmet | Headgear | Smith | 3 Materials + 2 Iron Ore | 1 | 10% |

Existing DNA aptitude, parental apprenticeship modifiers, care, adulthood, absence,
home specialization and fractional work apply. Occupational experience retains its
existing career-retention role; no extra personal skill-speed bonus is added. Targets spend nothing; whole completed
items consume exact resources once. No instant manufacture, automatic allocation,
extra economic resource, durability, health or damage system is introduced.

Protection combines the actual wearer's shield, body armor and helmet
multiplicatively, then caps total reduction at 60%. On standard saved rules,
armor plus helmet yields 28% without a shield, 46% with wood, 56.8% with leather,
and 60% with iron. At an otherwise 10% casualty risk these are 7.2%, 5.4%, 4.32%
and 4% respectively. These original examples use Leather Body Armor and Iron
Helmet. Iron-reinforced Body Armor with a Leather Helmet has 33.5% protection
without a shield; the 60% cap still applies with shields. A resident chooses
one body item and one helmet, so variants never stack within a slot. An ally's
armor never modifies another person's risk.

The base casualty risk multiplied by all remaining-risk factors is rounded down
once in basis points. The cap independently sets a minimum remaining risk, rounded
up once (CEIL): 40% of the base risk under standard rules. The higher result
applies. A base risk of 1 basis point therefore stays at 1 basis point; rounding
cannot turn protection into immunity.

When no personal armor is worn, the existing shield calculation and RNG sequence
remain exact. When neither additional variant is worn, the earlier v3 armor
snapshots, coefficients, casualty outcomes and RNG sequence also remain exact.
Historical policies and outcomes are not reinterpreted. Any
unsupported custom-policy combination must be rejected explicitly rather than
silently weakening existing protection.

## Inventory, production and history

Personal assignments have one item per Weapon, Shield, Body Armor and Headgear
slot. All finished items remain counted clan property. Equipping, replacement and
removal transfer real stock atomically, only for eligible residents at home.
Away, mining and territorial-duty restrictions retain the existing rule.

A prospective original armor target adopts Smithery v3, preserving earlier
recipes and ownership. A prospective Leather Helmet or Iron-reinforced Body
Armor target adopts Smithery v4 and records PersonalArmorVariantsAdopted (armor
policy version 2). The original adoption checkpoint and every earlier receipt
remain unchanged; the two new stored counts start at zero. Loading alone never
adopts a catalogue, grants gear or changes targets. Both Hides and Ore must be
available before a Smith completes the hybrid body-armor recipe.

Past v1/v2/v3 mission snapshots remain unchanged. Only dispatches with an actual
additional variant use Pillage equipment snapshot v4 or on-site personal-armor
policy v2. Other loadouts retain their earlier exact snapshot shape, even in a
v4 campaign. New dispatches freeze the four actual slots and relevant protection
policy only where needed. Actual on-site deaths lose carried items immediately; survivors retain
them. Home death and transfer use the existing clan-property recovery rule.
Versioned craft/loss receipts conserve both real ingredients and finished items
through save/load, split stepping and replay.

When a former Miner transfers into a clan without Mining, their recorded Miner
history and accumulated work progress remain valid. An unsupported active Miner
job closes on arrival, leaving the person unassigned. This does not grant the
recipient Mining permissions, an assigned site or a new occupation definition.

Hides come from eligible real livestock slaughter. Iron Ore comes from actual
finite mining or bog-iron extraction. Neither a preparation screen nor a portrait
may grant items merely because an asset is available.

## Supplied models and the native character

The source assets are the owner's supplied Meshy body armor and helmets;
variant-specific provenance and fit evidence remain separate. The original
leather vest contains only clothing, with open neck, armholes and hem. The hollow
Iron Helmet keeps
its supplied brown panels, iron bands and nasal strip. No substitute mannequin,
new generated model, independent skeleton or additional renderer is used.
Provenance must distinguish owner-supplied project authorization from an
independently verified open redistribution license.

Body armor is an explicitly qualified fitted garment layer over the normal
field tunic. Its clean main-panel carrier follows the native body, retaining the
supplied decorative pieces and four native influences; it is not a rigid enlarged
torso. The binding pins the exact underlying tunic source. A bounded per-wearer
underlay fit tucks qualified torso folds and the adjoining inner-arm seam beneath
the vest, using actual native body support. Original tunic indices and UVs remain
intact; visible sleeves, neckline, armholes and hem remain clothed. Any qualified
native skin-influence corrections are limited to the fitted vertices. Native-body
coverage and cached source geometry remain unchanged. Removing the vest restores
the complete original tunic; other wearers are unaffected.
The helmet uses the native head anchor, measured inner cavity and existing
bounded crown-hair fitting while preserving recognizable face and exposed hair
and beard. Preparation and fitting occur on appearance changes, never each frame.

Actual assignments drive expedition preparation, world and Character Card
presentation. Normal field clothing applies during exploration/combat. Home work
retains its occupational clothes, hats and tools; incompatible personal gear is
visually stowed with an honest status while ownership remains unchanged.
Unsupported ages, body bindings or source combinations need an explicit fallback,
not clipping, missing clothes or another character.

## Required evidence

Compare no armor, armor alone, helmet alone and both on pinned seeds, including
wood/leather/iron shields and both spears. Check actual ingredient production,
individual allocation, death/loss, survivor return, withdrawal, transfer, capture,
interrupted combat, historical saves and deterministic replay.

Native fitting needs representative age/body/sex/hair/beard/LOD samples across
Idle/Walk/Run and ready, attack, block, brace, withdrawal and casualty poses.
World, preparation and portrait must agree. The underlay fit needs measured
pose/body clearance, visible-boundary checks and exact unequip/cache/other-wearer
restoration. Record source/output hashes, texture
and triangle budgets, draw/material retention and CPU/GPU evidence. Desktop
browser evidence and physical iPhone acceptance remain separate. This contract
does not itself declare the asset fitting or owner QA accepted.
