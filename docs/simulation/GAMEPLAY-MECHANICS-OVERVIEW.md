# Pillagers — Gameplay Mechanics Overview

Status: shared design baseline after Simulation Runs #001/#002 and v0.3/v0.5 design exploration.
Purpose: communicate the current gameplay/simulation decisions to collaborators. This is a design baseline, not a claim that every mechanic is implemented.

## Canonical time model

- Canonical game start: **Winter 800**.
- One simulation year runs **winter-to-winter**.
- Player-facing age is expressed in **winters** (for example: `16 winters`).
- Internal age remains derived from `currentWinter - birthWinter`.
- Historical examples that use 1200+ in older design-run documents are legacy simulation notation only; future canonical examples should use Winter 800+.

## Core premise

Pillagers is a living Viking settlement simulation with active player control.

Residents are persistent people rather than disposable RTS units. They have CharacterDNA, family relationships, occupations, housing, life histories and economic consequences. The settlement can continue autonomously, but the player may directly intervene in occupations, care, housing, investments and later expeditions/raids.

The intended balance is:

> The simulation creates people, pressures, opportunities and consequences. The player actively decides how to respond.

## 1. People and CharacterDNA

Canonical CharacterDNA uses five gameplay-relevant traits:

- physicality
- agility
- intelligence
- cunning
- temperament

Heritage and appearance remain part of character identity but are not currently occupation modifiers.

CharacterDNA is persistent identity. Simulation state (household, partner, occupation, childcare, residence, history) is separate.

### Trait inheritance

Children born during simulation inherit trait values from their parents.

Baseline:
- each trait normally derives from both parents plus small deterministic variation;
- each trait independently has a 25% chance of becoming a **dominant legacy trait** inherited strongly from one parent;
- dominant-legacy status lasts for one generation only;
- the inherited numeric value can of course continue through ordinary genetics in later generations;
- heritage is inherited from the parents and normalized.

Dominant legacy is intentionally common enough to make family lines visibly recognizable.

## 2. Life cycle

- Adult/work/partner eligibility currently begins at age 16.
- Fertility window: partnered women age 18–40.
- Eligible birth chance: 25% per year.
- After a birth there are two complete cooldown years before the mother is birth-eligible again.
- Food shortage may temporarily block fertility.
- Mortality is probabilistic and increases with age.
- Age is derived from current year - birth year rather than duplicated as independent state.

### Productivity and age

Workers operate at full age productivity through age 49.

From age 50 onward productivity declines deterministically by 2 percentage points per year, with a 50% minimum.

This makes elders economically less productive without introducing a hard retirement age.

## 3. Kinship and partnerships

Family graph and Household are separate concepts.

Partnership eligibility excludes:
- parent/child;
- grandparent/grandchild;
- siblings and half-siblings;
- aunt/uncle with niece/nephew.

First cousins and more distant relations are allowed.

Partnership matching is autonomous by default, but the final matchmaking model still needs tuning around compatibility and age gaps.

Current design principle:
- relationships themselves are not directly assigned by the player;
- player actions may later influence opportunities (for example gatherings/feasts), but characters retain social autonomy.

Men may currently rematch after a partner dies. The widow/remarriage rules remain an explicit balancing/design topic because they strongly affect long-term demographic resilience.

## 4. Children and households

Children remain members of their parents' Household until they form their own partnership.

Becoming an adult does not automatically mean leaving home.

This allows adult children to:
- keep contributing to the family economy;
- benefit from family occupation knowledge;
- work in the household's economic building.

When a partnership forms, the new household seeks a residence.

## 5. Childcare

After giving birth, the mother normally contributes 0% occupation production for five years while providing childcare.

A later birth resets the five-year childcare period.

If an adult woman without an occupation is available, she may take over childcare:
- the mother can return to her occupation;
- the caregiver contributes no occupation production while caring;
- one caregiver supports one childcare situation at a time;
- an active caregiver is not fertility-eligible that year.

This creates an economic role for otherwise unoccupied adults and can make care allocation a direct player decision.

## 6. Occupations

Approved broader work categories are documented separately. Early simulations currently use a small economic subset such as Farmer, Fisher, Hunter and Woodcutter/material producer.

Occupation is not immutable identity.

### Occupation choice

Autonomous occupation choice combines:
- settlement economic need;
- CharacterDNA aptitude;
- family/apprenticeship experience;
- existing personal experience.

CharacterDNA aptitude should reuse the canonical five traits rather than introducing a second stat system.

Having a parent who has practiced the same occupation gives a cultural/apprenticeship advantage. This is not genetic inheritance.

### Occupation history and switching

Residents retain occupation history.

Autonomous residents may review occupation roughly every five years, but should only switch when:
1. there is a real settlement need for the alternative; and
2. the alternative is personally credible/better, not merely economically fashionable.

A retention/experience bias prevents constant optimization.

After a switch:
- first-year productivity is reduced to 75%;
- previous occupation history is retained.

The player is allowed to override this and reassign a resident directly, accepting the aptitude and retraining consequences.

## 7. Resources

The early simulation intentionally uses only two abstract resources.

### Food

Initial prototype production:
- Farmer: 4/year
- Hunter: 3/year
- Fisher: 3/year

Initial consumption:
- Adult: 2/year
- Child: 1/year

Food shortage:
- blocks fertility initially;
- prolonged shortage increases mortality pressure.

These numbers are prototype balancing values, not historical claims.

### Materials

Materials represent abstract construction and maintenance capacity.

Baseline:
- material producer / Woodcutter: 2/year at 100% productivity;
- new permanent house: 10 Materials;
- base permanent house upkeep: 1 Material/year;
- tent upkeep: 0 Materials.

Materials are intended to remain useful after the housing crisis through workplace upgrades.

## 8. Family, Household, Residence and Building

These are distinct.

**Family / lineage** — kinship relationships across generations.

**Household** — people sharing a domestic/economic unit.

**Residence** — where a household currently lives.

**Building** — a persistent physical structure in the settlement.

A Household can dissolve while its Building remains.

A vacant permanent Building pays no upkeep, but vacancy still creates maintenance debt. Each full unoccupied winter adds one debt step. After **3 consecutive vacant winters**, the Building collapses and returns the normal 50% salvage of total invested Materials. If a Household moves in before collapse, vacancy debt stops; normal occupied upkeep resumes and a paid upkeep year resets maintenance debt.

### Housing priority

When a household needs residence:
1. use a vacant suitable house if one exists;
2. otherwise build a new permanent house for 10 Materials if affordable;
3. otherwise live in a tent.

Tent households automatically move into suitable vacant houses before new construction is required.

The player may actively decide residence assignment rather than always accepting the autonomous choice.

### Tents

A tent household:
- costs no Material upkeep;
- residents work at 50% productivity;
- can still form families and have children.

### House maintenance and collapse

A base permanent house costs 1 Material/year upkeep while occupied.

A permanent building accumulates one maintenance-debt step per winter when either:
- it is occupied but full upkeep is not paid; or
- it is vacant (vacant buildings pay no upkeep).

At 3 consecutive debt winters:
- the building collapses;
- an occupying Household, if any, moves to a tent;
- 50% of all Materials invested in the building are salvaged.

A paid occupied upkeep year resets maintenance debt to 0. A vacant building reused before collapse stops vacancy decay and returns to normal occupied-upkeep rules.

## 9. Economic buildings / homesteads

A permanent residence can also carry an economic specialization.

Examples:
- Farmer -> Farm
- Fisher -> Fishing Yard
- Woodcutter -> Logging/Woodworking Yard
- Smith -> Smithy
- Trader -> Trading Post

The building specialization does not automatically change when occupants change occupation.

A worker only receives the workplace bonus when their occupation matches the building specialization.

This creates active player decisions around who lives/works where and whether an old workplace should be repurposed.

### Upgrade system

| Level | Upgrade cost | Productivity bonus | Building upkeep |
|---|---:|---:|---:|
| Base | - | +0% | 1/year |
| I | 5 Materials | +25% | 2/year |
| II | 10 Materials | +50% | 3/year |
| III | 20 Materials | +75% | 4/year |

Bonuses are additive relative to base occupation production.

Upgrades belong to the Building, not the worker. When a worker dies or leaves, the investment remains.

If an upgraded building collapses, salvage is 50% of total Materials invested in base construction plus upgrades.

This creates **material legacy** alongside genetic and cultural legacy.

## 10. Productivity model

Conceptually:

```text
actual production =
    base occupation output
  x character aptitude
  x housing modifier
  x workplace upgrade modifier
  x age modifier
  x career-switch modifier
  x activity status
```

Examples of modifiers:
- permanent residence: 100%
- tent: 50%
- workplace I/II/III: +25% / +50% / +75% to matching work
- age <=49: 100%
- age 50+: -2 percentage points/year, floor 50%
- first year after occupation switch: 75%
- childcare: 0% occupation output

Exact stacking/calibration remains a balancing task.

## 11. Player agency

The final game should not be a passive simulation viewer.

The settlement can operate autonomously, but the player can directly intervene.

Player actions may include:
- assign or change a resident's occupation;
- choose a caregiver;
- build houses;
- assign households to residences;
- choose building economic specialization;
- upgrade workplaces;
- decide where scarce Materials are invested;
- later assign people to expeditions/raids;
- later make other settlement/strategic interventions.

The player generally does **not** directly:
- choose who falls in love;
- force a birth;
- alter CharacterDNA;
- prevent natural aging/death.

The design goal is:

> Residents remain people with their own traits, families and life events, while the player has enough direct authority to make strong strategic decisions.

## 12. Why individual residents matter

A resident is simultaneously:
- a family member;
- a genetic lineage;
- a worker with aptitude and experience;
- a resident of a physical household/building;
- a possible caregiver;
- later potentially a raider/combatant;
- a source of persistent history/lore.

Losing a person therefore has systemic consequences.

A future raid should not lose a generic “Warrior unit”; it may lose the settlement's Smith, parent, experienced Hunter or member of a rare family line.

## 13. Three forms of legacy

The simulation currently points toward three complementary legacies:

**Genetic legacy**
- inherited CharacterDNA traits;
- one-generation dominant traits.

**Cultural legacy**
- parental occupation/apprenticeship advantage;
- personal occupation history and experience.

**Material legacy**
- houses and upgraded workplaces persist beyond individual residents.

Together these allow the settlement itself to develop a history.

## 14. Simulation / game architecture principle

The long-term game should use the same simulation core for:
- headless simulation;
- Simulation Lab;
- Three.js World/game client;
- later AI-controlled communities.

Rendering should not own game truth.

Important state changes should emit events so the same history can support:
- UI;
- debugging;
- character biographies;
- settlement history;
- Lore Mode.

## 15. Simulation learnings so far

Manual Runs #001 and #002 established the usefulness of:
- generational continuity instead of random replacement;
- separating lineage, household and housing;
- Food and Materials as small but causally useful resources;
- housing collapse, tents and salvage;
- resource-driven occupation pressure.

The later v0.3/v0.5 design exploration added:
- real CharacterDNA as economic aptitude;
- dominant inherited traits;
- childcare;
- age productivity;
- occupation switching/history;
- persistent/vacant buildings;
- economic building upgrades;
- direct player intervention.

The next exact simulation should use a formal deterministic ruleset and expose exact stock/trend information at each player checkpoint.

## 16. Current player-checkpoint concept

For design testing, the simulation can pause every five years and present:

- population and demographic trend;
- Food stock, 5-year trend and current annual balance;
- Materials stock, 5-year trend and current annual balance;
- households / houses / tents / vacant buildings;
- active workplaces and upgrade levels;
- important people/events;
- risks and opportunities.

The player can then intervene before the next simulation interval.

This five-year cadence is a design/testing device; the final game may allow continuous/realtime intervention.
