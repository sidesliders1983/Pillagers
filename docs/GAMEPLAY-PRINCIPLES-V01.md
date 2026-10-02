# Pillagers — Core Gameplay Principles v0.1

> **Status:** Canonical gameplay foundation  
> **Last aligned with GAME-PRINCIPLES.md:** 2026-10-02
>
> This document defines the core gameplay contract for Pillagers. Individual mechanics may evolve, but new systems should reinforce these principles rather than work around them.
>
> `GAME-PRINCIPLES.md` is the authority for approved cross-cutting decisions such as calendar wording, lore constraints, platform direction and settlement terminology. This document explains how those decisions fit together as gameplay.

---

# 1. Core fantasy

Pillagers is a **generational settlement simulation with RTS elements**.

The player begins with a small Viking / North Sea-inspired community and guides it across multiple generations into a powerful regional realm.

The world is not made of disposable RTS units. Every resident is an individual with a persistent identity, including some combination of:

- name;
- age;
- sex;
- DNA / inherited traits;
- appearance;
- personality traits;
- family relationships;
- partner and household relationships;
- occupation, skills and experience;
- personal history;
- loyalties and social connections.

The central fantasy is:

> **Build a people, not an army.**

Residents should matter during their own lifetime and through the generations that follow them.

Conceptually:

```text
residents
→ households and families
→ community
→ settlement
→ multiple settlements
→ realm
```

A **clan** is not the default synonym for settlement or community. If clan/tribe structures are introduced later, they should be modelled explicitly as kinship or political structures.

---

# 2. Approved terminology

Use these terms consistently in player-facing design:

| Concept | Dutch | English | Meaning |
|---|---|---|---|
| Physical place | Nederzetting | Settlement | Homes, farms, workshops, landing sites and defenses |
| Social group | Gemeenschap | Community | The people belonging to a social group, whether or not every member is currently resident |
| Individual | Bewoner | Resident | A person living in a settlement; no automatic implication of combat, kinship or rank |
| Domestic unit | Huishouden | Household | People sharing a domestic/economic unit |
| Kinship | Familie / verwantschapsgroep | Family / kin group | A relationship structure distinct from settlement and household |

`Persona` remains useful development vocabulary, but **resident** is the preferred player-facing term.

---

# 3. Ultimate objective

The long-term campaign objective is:

> **Grow a small community into the dominant regional realm and ultimately unite the region under its rule.**

Working end-state concept:

> **Unify the Realm**

The final political expression may eventually be recognition of the player's current ruler as the dominant regional authority, for example a High Chief or High King.

Regional control does not require every rival community to be destroyed. Other communities may become part of the player's realm through combinations of:

- conquest;
- annexation;
- submission;
- tribute or vassalage;
- alliance;
- political marriage;
- gradual integration.

Prosperity, conquest and influence are therefore **routes toward one shared objective**, not separate victory games.

---

# 4. Failure condition

The death of the current chief is **not** game over.

The loss of the original settlement is **not automatically** game over.

The campaign ends only when the player's people can no longer meaningfully continue as a recoverable community/realm: there is no surviving controlled community, viable successor structure or path back to continuity.

This deliberately allows collapse-and-recovery stories.

---

# 5. The player's role

The player is not an omnipotent god controlling every human action and is not limited to directly controlling one physical character.

The intended framing is:

> **The player is the enduring will of their people, expressed in-world through the current chief.**

The current chief is a real simulated resident:

- generated from the same character system;
- has DNA and traits;
- has family and relationships;
- has age and history;
- can work and fight;
- can be injured or killed;
- eventually dies.

When the chief dies, leadership passes through succession rather than ending the campaign.

## What the player controls directly

The player's strongest agency is strategic and communal:

- building placement and upgrades;
- settlement priorities;
- resource allocation;
- exploration targets;
- founding or taking settlements;
- manual occupation assignment;
- military mobilization and objectives;
- important diplomatic decisions;
- captive / defeated-enemy policy;
- selected high-impact marriage decisions;
- succession influence where the culture allows it;
- broad policies later.

## What the player normally does not control directly

The player should not need to manually choose:

- every movement;
- every meal;
- every work animation;
- every friendship;
- every romantic pairing;
- every birth;
- every routine occupation assignment;
- every household decision.

The desired feeling is:

> **Lead a living community, rather than puppeteer it.**

---

# 6. Core interaction principle

## Autonomous by default, controllable by choice

> **The simulation should make sensible decisions on its own, while the player may intervene where a decision matters to them.**

A community must remain functional without constant micromanagement, but autonomy must never make the player a passive observer.

Examples:

### Occupations

```text
community detects demand
→ evaluates available residents
→ assigns suitable work automatically
```

The player can override a specific resident's primary occupation.

### Relationships

```text
residents encounter one another
→ familiarity develops
→ compatibility / attraction develops
→ relationships may form
→ households may emerge
```

The player normally does not pair every couple, but can later influence important political/dynastic matches.

### Economy and construction

The player sets intent and priorities; residents carry out the work.

### War

Residents live ordinary lives until mobilized. The player forms warbands, chooses objectives and decides strategic outcomes.

This principle must still work when the population grows from a few dozen residents to hundreds.

---

# 7. Three core gameplay pillars

All major mechanics should primarily strengthen one or more of these pillars.

## A. Sim Life

Residents are born, grow up, form relationships, contribute to their community, age and die.

Core systems include:

- birth and childhood;
- aging;
- matchmaking / relationships;
- households;
- reproduction;
- occupation and skill development;
- social relationships;
- inheritance / DNA;
- death;
- succession.

## B. Community Building

The player grows settlements into a functioning society.

Core systems include:

- housing;
- construction and upgrades;
- food and resources;
- occupations and tasks;
- production chains;
- community needs;
- defense;
- exploration;
- expansion;
- new settlements;
- trade and exchange.

## C. Conflict, Conquest & Integration

Communities compete for people, land and resources.

Core systems include:

- raids;
- combat and defense;
- settlement attacks;
- destruction and conquest;
- surrender;
- captives;
- slavery;
- execution;
- release / ransom;
- integration;
- tribute / submission;
- alliances and diplomacy.

Defeated people remain **people**, not loot values.

---

# 8. Resident lifecycle

Every resident belongs to the same generational simulation.

Conceptual lifecycle:

```text
birth
→ early childhood
→ visible childhood
→ adolescence
→ adulthood
→ work / family / social role
→ aging
→ death
```

Player-facing age is expressed in **winters**.

Examples:

```text
1 winter old
32 winters old
```

Internally, age remains numeric.

---

# 9. Birth and early childhood

Residents exist in the simulation from birth even when they are not rendered as independent 3D agents.

Current intended model:

```text
Age 0–4/5
→ household child
→ exists in family/population data
→ consumes resources
→ occupies household capacity
→ linked to parents
→ no independent world agent required

Age 5+
→ visible simulated child resident
→ uses the universal Character Lab / world character pipeline
```

The exact visible-child threshold remains configurable while the character system develops.

---

# 10. Matchmaking, households and reproduction

Matchmaking is primarily **emergent**.

Residents can encounter one another through:

- settlement proximity;
- work and tasks;
- family networks;
- social events;
- shared activities;
- travel;
- contact with other communities.

Compatibility may eventually be influenced by:

- age;
- personality;
- attraction;
- kinship constraints;
- social standing;
- culture;
- reputation;
- existing relationships;
- personal history.

Relationships should develop over time rather than appearing instantly.

Simplified flow:

```text
meet
→ familiarity
→ compatibility / attraction
→ partnership
→ household
→ possible children
```

For biological reproduction, compatible male/female adults can form child-bearing partnerships subject to kinship and fertility rules.

Children inherit from existing residents through the DNA system. Population growth therefore creates **families and bloodlines**, not anonymous villagers.

## Player influence

The player should not choose every match. Intervention is reserved for high-impact cases such as:

- alliances;
- succession;
- important families;
- political marriages;
- integration between communities.

---

# 11. Households, caregiving and work availability

Households bridge family simulation and settlement building.

A household may contain:

- partners;
- young children;
- older children;
- dependent relatives;
- servants or enslaved people later.

Housing affects population capacity, family formation, childcare and settlement growth.

The simulation normally decides who lives together; the player supplies housing capacity and may later override exceptional cases.

Pregnancy, infancy and caregiving can temporarily reduce a resident's availability for ordinary work. The architecture should therefore model **availability**, not permanent work/non-work categories based purely on sex.

---

# 12. Occupations, skills, tasks and roles

Occupations connect individual residents to the settlement economy, but an occupation is **not an immutable class**.

The approved model is:

> **A resident has skills, performs tasks and may have a displayed primary occupation that summarizes their main skilled work.**

A resident can help outside their primary occupation when circumstances require it.

Examples:

- a farmer can help with harvest, simple construction or defense;
- a fisher can repair their own equipment;
- a woodworker can contribute to building tasks;
- a smith may be temporarily mobilized as a fighter;
- seasonal workload can shift without permanently changing identity.

## Approved initial occupations

The first ten approved work categories are:

1. **Farmer** — Boer / akkerbouwer
2. **Livestock keeper / herder** — Veehouder / herder
3. **Fisher** — Visser
4. **Hunter** — Jager
5. **Textile worker** — Textielmaker
6. **Smith** — Smid
7. **Woodworker** — Houtbewerker
8. **Boatbuilder** — Bootbouwer
9. **Trader** — Handelaar
10. **Leather and jewellery maker** — Leer- en juwelenmaker

These are approved gameplay categories, not a claim that they were the ten statistically most common historical occupations.

`Warrior`, `raider`, `guard`, `builder`, `gatherer` and similar labels are **not part of the approved starting occupation set**. They may be temporary roles/tasks or become separately approved occupations later if the simulation needs them.

Social status is also separate from occupation.

## Occupation assignment

The community continuously evaluates what work is needed.

Conceptually:

```text
community demand
× resident aptitude
× core traits
× existing skills / experience
× age
× availability
× local opportunity
→ occupation preference / assignment
```

Examples:

```text
food pressure
→ demand rises for farmer / herder / fisher / hunter work
```

```text
tool bottleneck
→ demand rises for smith work
```

```text
housing or shipbuilding backlog
→ demand rises for woodworker / boatbuilder capacity
```

```text
clothing shortage
→ demand rises for textile and leather work
```

```text
external exchange opportunity
→ demand rises for trader capacity
```

If the player does nothing, the community should organize itself. The player can manually override an individual resident's primary occupation.

Poor aptitude must mean **less suitable**, never impossible.

## Occupation progression

Repeated work should later create skill/mastery. Losing a highly experienced specialist should therefore matter economically and socially.

Detailed purpose, tasks, inputs, outputs, workplace, tools, seasonal behavior and community demand for each of the ten occupations are intentionally defined in a separate occupation-mechanics layer.

Research and approved terminology: `docs/VIKING-OCCUPATIONS-AND-TERMINOLOGY.md`.

---

# 13. DNA must affect gameplay

Character DNA and core traits must not remain purely visual.

Inherited traits can influence probabilities and aptitude across systems such as:

- occupation fit;
- physical work;
- combat performance;
- learning;
- social behavior;
- leadership;
- risk tolerance;
- matchmaking compatibility;
- descendants.

Traits should influence outcomes without making characters deterministic.

The simulation combines:

> **nature + experience + opportunity + circumstance**

---

# 14. Time and annual simulation heartbeat

The approved game calendar begins in:

```text
800 AD / 800 n.Chr.
```

Every completed game year adds one **winter** to a surviving resident's age.

The current Fjordside prototype is testing:

```text
1 in-game year = 60 real-time seconds
```

This 60-second duration is a **prototype setting, not yet a permanent game principle**.

The annual clock is nevertheless an important simulation seam for systems such as:

- aging;
- fertility and family progression;
- childhood transitions;
- health;
- death;
- occupation eligibility;
- settlement needs;
- household changes;
- succession;
- Saga / Legacy milestones;
- annual historical summaries.

Simulation time must remain independent from visual presentation. Day/night and seasonal transitions are presentation layers, not the authority for aging or calendar progression.

---

# 15. Settlement building, needs and economy

The player's direct control is strongest at the settlement level.

The player decides what should be built, improved, defended or prioritized. Residents execute the work through tasks and skills.

Example:

```text
player approves a longhouse
→ resource requirements become demand
→ suitable residents gather/transport materials
→ woodwork/construction tasks are performed
→ building is completed in-world
```

A separate permanent `Builder` occupation is not assumed by this principle.

The economy exists to support people and expansion, not merely abstract counters.

Core needs may include:

- food;
- shelter;
- warmth;
- clothing;
- tools;
- weapons;
- building materials;
- transport;
- defense.

Economic pressure should feed back into resident behavior and occupation demand.

---

# 16. Exploration and expansion

The world is not fully known at the start.

Exploration can reveal:

- resources;
- terrain;
- defensible locations;
- other settlements;
- other communities;
- trade opportunities;
- conflict opportunities;
- expansion locations.

A growing realm should become a network of settlements and communities, not one infinitely expanding village.

---

# 17. Combat and mobilization

Combat is an RTS layer built on top of the life simulation.

A fighter is normally an existing resident temporarily mobilized into a military role rather than a separate spawned unit or necessarily a permanent occupation.

Mobilization therefore has an economic cost:

```text
resident leaves ordinary work
→ settlement loses that labour temporarily
→ resident enters warband
→ injury/death can permanently remove skills, relationships and family members
```

The player should be able to choose military objectives and, where useful, warband composition.

---

# 18. Defeat, captives and integration

After conflict, surrendered or captured enemies remain residents/persons in the simulation.

Possible later policies include:

```text
execute
enslave
integrate
ransom
release
tribute / submission
```

An integrated former enemy may later work, form relationships, have children and create a new bloodline inside the realm.

Conflict therefore changes the demographic and cultural composition of the player's world.

---

# 19. Succession

The current chief is mortal.

When leadership changes, succession should eventually consider factors such as:

- kinship;
- culture / inheritance rules;
- age;
- reputation;
- relationships;
- support from influential families;
- player influence.

A contested succession may later produce factions, loss of loyalty or internal conflict.

The key principle remains:

> **Chief death creates a new political situation, not a game-over screen.**

---

# 20. Saga / Legacy progression

Progress toward realm unification should be visible through a non-linear milestone structure. Working names include **Saga**, **Legacy** or **Renown**.

Initial branches:

### Prosperity
Population, settlement growth, production, reserves and trade.

### Conquest
Raids, military victories, territory, submission and conquest.

### Influence
Alliances, integration, dynastic relationships and political connection.

The branches are not mutually exclusive. Higher milestones should often combine them.

They converge toward one strategic objective:

> **Unify the Realm**

---

# 21. Event-backed lore and historical memory

Pillagers may turn simulation history into an annual chronicle, but storytelling is subordinate to recorded facts.

The authoritative rule from `GAME-PRINCIPLES.md` is:

> **Lore tells only what actually happened.**

Simulation systems should emit semantic events into an authoritative event ledger. Chronicles may select and stylize those recorded events but must not invent dialogue, motives, witnesses, causes, weather or outcomes that were not modelled.

This means the life, occupation, economy and combat systems should eventually emit meaningful events when actions actually complete.

Examples:

```text
harvest completed
boat completed
trade completed
partnership formed
child born
resident died
settlement founded
raid resolved
```

Only events the simulation truly supports may be recorded under those names.

---

# 22. Scope guardrails

Every proposed major mechanic should answer at least one of these questions:

1. Does it deepen **Sim Life**?
2. Does it deepen **Community Building**?
3. Does it deepen **Conflict, Conquest & Integration**?
4. Does it create meaningful interaction between those pillars?
5. Does it matter within a generation or echo into later generations?
6. Does it contribute toward the journey from small community to unified realm?

If not, it is probably not core scope.

---

# 23. Development order

The intended gameplay stack can be built and validated layer by layer:

```text
1. annual clock / age / winters
2. factual event ledger + annual chronicle seam
3. resident lifecycle
4. households / matchmaking / reproduction
5. occupation + skills + task model
6. community needs and economy
7. housing / construction / settlement growth
8. exploration / other communities
9. combat / mobilization
10. captives / integration
11. succession / leadership
12. diplomacy / influence
13. Saga / Legacy progression
14. realm-unification endgame
```

The first ten occupations should be specified before implementing the wider economy so their **purpose, tasks, inputs, outputs and failure consequences** define what the economy actually needs to simulate.

---

# 24. Core principles summary

> **Build a people, not an army.**

> **Autonomous by default, controllable by choice.**

> **Residents have skills and tasks; occupation is a primary specialization, not an immutable class.**

> **DNA affects gameplay, not just appearance.**

> **Growth creates complexity as well as power.**

> **The player persists across generations; the current chief represents that authority in-world.**

> **A chief's death creates succession, not game over.**

> **War changes the population because fighters and captives remain real people.**

> **Lore may stylize recorded history but never invent history.**

> **Prosperity, conquest and influence all lead toward one shared objective: Unify the Realm.**

> **Every important mechanic should matter now or echo into the next generation.**
