# Pillagers — Core Gameplay Principles v0.1

## Status

This document defines the **core gameplay identity of Pillagers**.

It is intended to be the reference point for future gameplay systems, prototypes and scope decisions. Individual mechanics may evolve, but new features should reinforce these principles rather than pull the game in unrelated directions.

---

# 1. Core fantasy

Pillagers is a **generational Viking settlement / clan simulation with RTS elements**.

The player begins with a small clan and a single settlement and guides that community across multiple generations toward becoming the dominant realm in the region.

The game is not primarily about commanding disposable RTS units.

It is about building a **living people**:

```text
people
→ families
→ clan
→ settlement
→ territory
→ realm
```

Every person is an individual with DNA, traits, relationships, history and descendants. Population growth is therefore not merely economic growth: it creates new families, loyalties, conflicts, skills and political complexity.

The long-term fantasy is:

> **Begin as a small clan and build, across generations, a dynasty and society capable of unifying the region under its rule.**

---

# 2. The player role

The player is **not an omnipotent god** and is also not limited to directly controlling one physical character.

The intended framing is:

> **The player is the spirit of the clan, expressed through its current chief.**

Narratively, the current chief represents the player's authority in the world.

Mechanically, the player guides the clan as a persistent entity across generations.

Therefore:

- the current chief is a real simulated persona;
- the chief has DNA, traits, family, relationships, age and history;
- the chief can die;
- the death of the chief is **not game over**;
- leadership passes to a successor;
- the player's continuity exists at clan/dynasty level rather than individual-character level.

This allows individual leaders to matter while preserving a campaign that can span centuries.

---

# 3. Primary interaction principle

## Autonomous by default, controllable by choice

This is the central interaction rule for Pillagers.

> **The community should function by itself, but the player must be able to intervene where a decision matters to them.**

The player should not be forced to micromanage every person in a large settlement.

At the same time, people must not feel so autonomous that the player becomes a passive observer.

Examples:

### Occupations

By default, the community assigns occupations according to current needs and character suitability.

Conceptually:

```text
community demand
× aptitude / traits
× availability
× experience
× opportunity
→ likely occupation
```

If food production is insufficient, the community may naturally assign more people to farming, fishing, hunting or related work.

However, the player may directly assign an occupation to a specific persona when desired.

Example:

```text
Community: assigns Erik as hunter because food is needed.
Player: overrides Erik → blacksmith.
```

This principle should generalize to other systems.

### Relationships

People should primarily form relationships themselves.

The player should not normally have to pair every couple manually.

Later systems may allow high-impact intervention such as arranged marriages, political marriages or household relocation.

### Settlement activity

People choose normal routines and work autonomously.

The player sets priorities, projects, policies and strategic direction.

### Warfare

People live autonomously until the chief calls them into a warband or gives a military objective.

---

# 4. The three core gameplay pillars

Everything in the core game should primarily reinforce one or more of these three pillars.

## A. Sim Life

Every persona belongs to a living generational simulation.

Core lifecycle:

```text
birth
→ childhood
→ adolescence
→ adulthood
→ relationships
→ occupation / social role
→ children
→ aging
→ death
```

Important principles:

- personas interact with others;
- children grow into adults;
- relationships form and change;
- people match with partners and may have children;
- adults contribute to the community according to need and personal suitability;
- personality / DNA should influence behavior and outcomes;
- people age and eventually die;
- descendants inherit both biological and historical context.

The DNA system must have **gameplay consequences**, not merely visual consequences.

Traits can influence areas such as:

- occupation suitability;
- combat behavior;
- social compatibility;
- leadership potential;
- willingness to follow the chief;
- family / relationship dynamics;
- future descendants.

### Young children

The universal 3D character pipeline currently starts around age 5–6.

Therefore the intended simulation model is:

```text
Age 0–4/5
→ household child
→ exists in family/population data
→ consumes household/community resources
→ occupies housing
→ no independent 3D world agent required

Age 5/6+
→ visible simulated persona
→ enters the world as a character agent
```

Exact age thresholds may be tuned later.

---

## B. Community Building

The clan must survive, grow and expand into a functioning society.

Core activities include:

- building homes;
- expanding and upgrading settlements;
- constructing defenses;
- managing resources and economic needs;
- creating occupations and production capacity;
- exploring surrounding territory;
- founding additional settlements;
- maintaining enough food, shelter and security for the population.

The economy exists to support people and strategic growth, not as an isolated spreadsheet game.

Growth should create both power and complexity.

Example:

```text
20 people
→ simple, understandable clan

150 people
→ multiple families
→ specialists
→ rival interests
→ political influence
→ settlement leaders
→ social tension
```

A larger clan is therefore not simply the same game with bigger numbers.

---

## C. Combat, Raiding and Conquest

The player can use military force against rival communities.

Core activities include:

- forming warbands;
- raiding other settlements;
- defending territory;
- burning or damaging enemy settlements;
- conquering settlements;
- taking control of territory;
- defeating rival clans.

Combat should connect directly back into the life and community simulations.

Warriors are not anonymous units: they are parents, children, siblings and members of families.

A death in battle should therefore have social and demographic consequences.

---

# 5. Defeated enemies and prisoners

Victory should create decisions rather than simply deleting the losing population.

Defeated or surrendered enemies may eventually be handled through policies/actions such as:

```text
execute
enslave
integrate
ransom
release
```

Exact options and historical framing remain subject to design iteration.

The important principle is that captured people remain **persons inside the simulation**.

An integrated former enemy may later:

- receive an occupation;
- form relationships;
- marry into the clan;
- have children;
- create a new bloodline inside the player's realm;
- retain loyalty or resentment based on past events.

This is one of the key ways warfare feeds back into the DNA and generational systems.

---

# 6. Generational gameplay

Pillagers should be designed around **generational consequences**.

A useful scope test is:

> **Does this mechanic matter within a generation, or does it meaningfully affect generations that follow?**

Examples:

- a blacksmith matters now because they produce equipment;
- a marriage matters because it connects families and creates descendants;
- a raid matters because it changes resources, population and relationships;
- a captured enemy matters because their descendants may become part of the clan;
- a settlement matters because it may become a regional center decades later.

The player should regularly recognize people or families whose history stretches back many in-game years.

---

# 7. Succession

Succession is a core mechanic, not a fail state.

When the current chief dies, leadership passes to another persona.

Potential succession factors may eventually include:

- culture / inheritance rules;
- family lineage;
- age;
- reputation;
- relationships;
- support from important families;
- player preference;
- political conflict.

A successor does not need to play like the previous chief.

Different personality traits and relationships should create different circumstances for the clan.

Possible later consequences include:

```text
popular succession
contested succession
family faction
loss of loyalty
succession dispute
civil conflict
```

The exact political system is later scope, but the architecture should not assume immortal or interchangeable leaders.

---

# 8. Main campaign objective

Pillagers should have one clear primary strategic objective rather than many unrelated victory types.

## Unify the Realm

The player begins as a small clan and ultimately seeks to become the dominant political power of the region.

The final fantasy is that the clan's ruler becomes recognized as the region's supreme ruler / **High King or equivalent title**.

Control does not have to come exclusively through extermination.

A rival clan may ultimately be:

- conquered;
- annexed;
- destroyed;
- integrated;
- allied closely enough to join the realm;
- made tributary / subordinate;
- linked dynastically or politically.

The exact numerical victory threshold is not defined yet.

The design principle is:

> **Multiple strategies can contribute toward one shared end goal: unification of the realm.**

---

# 9. Saga / Legacy progression

Progress toward realm unification should be visible through a **non-linear milestone tree**.

Working name:

- Saga
- Legacy
- Renown

Final naming is TBD.

This is not intended to be a traditional XP skill tree.

It represents what the clan has actually achieved during its history.

Initial branches:

## Prosperity

Growth through population, production, settlement building and economic strength.

Possible milestones:

- population thresholds;
- sustained resource surplus;
- first upgraded settlement;
- second settlement founded;
- trade network established;
- regional economic influence.

## Conquest

Growth through warfare and military dominance.

Possible milestones:

- first raid;
- first enemy settlement defeated;
- rival chief defeated;
- territory conquered;
- tributary established;
- major war won.

## Influence

Growth through diplomacy, integration, alliances and dynastic relationships.

Possible milestones:

- first alliance;
- inter-clan marriage;
- captured enemy successfully integrated;
- allied clan joins the realm;
- multiple clans politically connected.

These branches are **not mutually exclusive**.

Higher-level milestones should often require achievements across more than one branch.

Conceptually:

```text
Prosperity ─┐
            ├─ Regional Power ─┐
Conquest ───┤                  ├─ Unify the Realm
            │                  │
Influence ──┘                  ┘
```

This keeps different playstyles meaningful while preserving one overall strategic objective.

---

# 10. Failure condition

The death of an individual chief is not game over.

The loss of the original settlement is not automatically game over.

The primary failure state is:

> **The player's clan ceases to exist as a viable continuing community.**

This allows comeback stories.

Example:

A once-powerful realm may lose its capital and most of its population but survive through a small branch of the clan elsewhere in the world.

As long as the clan survives, the campaign can continue.

---

# 11. Time as the simulation heartbeat

Current gameplay target:

```text
1 real-time minute = 1 in-game year
```

The current Fjordside prototype starts at:

```text
1200 DC
```

The historical era label / calendar presentation may be refined later; the important gameplay rule under test is the compressed annual heartbeat.

Every completed year is the basic long-term simulation pulse for systems such as:

- aging;
- child development;
- fertility / family progression;
- long-term relationships;
- skill development;
- succession;
- demographic changes;
- generational history;
- Saga milestones.

Short-term gameplay such as movement, construction, gathering and combat continues in real time between annual ticks.

Simulation time and visual presentation must remain separate systems.

The current prototype is testing day/night versus seasonal visualizations for this 60-second year, but neither visualization is a foundational gameplay requirement until validated.

---

# 12. Emergent history

The player's campaign should generate a history unique to that world.

The simulation should make it possible for stories such as these to emerge naturally:

- the child of a captured enemy becomes a respected craftsperson;
- two families become rivals across multiple generations;
- a war kills several members of one bloodline and changes succession;
- an arranged marriage prevents a war;
- a small settlement becomes the center of the realm decades later;
- descendants of the founding population still occupy important roles many generations later.

The game should remember enough of these events that people feel connected to the history that created them.

---

# 13. Player agency vs simulation agency

Pillagers should continuously balance these two forces.

## The simulation decides

- everyday routines;
- most social interactions;
- default occupation assignment;
- normal movement and work;
- organic relationship formation;
- individual reactions based on traits and history.

## The player decides

- strategic priorities;
- settlement expansion;
- major construction projects;
- exploration targets;
- occupations when the player wants to override the simulation;
- military objectives;
- warband composition / mobilization;
- prisoner policy;
- high-impact political decisions;
- succession influence where the culture allows it.

The player should feel like a powerful leader of a living community, **not a puppeteer controlling every animation** and not a spectator watching an untouchable simulation.

---

# 14. Core gameplay loop

At the highest level:

```text
SURVIVE
   ↓
GROW
   ↓
SPECIALIZE
   ↓
EXPLORE
   ↓
ENCOUNTER OTHER CLANS
   ↓
COOPERATE / COMPETE / RAID / CONQUER
   ↓
ABSORB PEOPLE, KNOWLEDGE, RESOURCES OR TERRITORY
   ↓
NEW GENERATION
   ↓
DEAL WITH INTERNAL CONSEQUENCES
   ↓
EXPAND TOWARD REALM UNIFICATION
   ↺
```

Each repetition of this loop should alter both the genetic and cultural composition of the clan.

---

# 15. Scope guardrails

To prevent Pillagers from becoming too broad, every proposed major mechanic should answer at least one of these questions:

1. Does it deepen **Sim Life**?
2. Does it deepen **Community Building**?
3. Does it deepen **Combat / Conquest**?
4. Does it create meaningful interaction between those pillars?
5. Does it contribute toward the generational journey from clan to realm?

If not, it is probably not core scope.

For the first playable gameplay layers, avoid prematurely expanding into unrelated standalone victory systems such as separate economic, religious, cultural or technological victories.

Prosperity, conquest and influence are **routes toward the same realm objective**, not separate games.

---

# 16. Core design principles summary

The following statements should guide future development decisions:

> **Build a people, not an army of disposable units.**

> **Autonomous by default, controllable by choice.**

> **Every persona is a person with history, relationships and descendants.**

> **DNA must affect gameplay, not just appearance.**

> **Growth creates complexity as well as power.**

> **The player leads through the current chief, but plays as the enduring clan.**

> **A chief's death creates succession, not game over.**

> **War changes the population; defeated people remain part of the simulation.**

> **Multiple strategies lead toward one shared objective: Unify the Realm.**

> **Every important mechanic should matter now or echo into the next generation.**

---

# 17. Current core-system direction

The core gameplay stack is therefore expected to grow around:

```text
1. annual simulation clock
2. persona lifecycle / aging
3. relationships / reproduction / families
4. occupations / community needs
5. settlement building / economy
6. exploration / territory
7. combat / raiding / conquest
8. prisoners / integration
9. succession / leadership
10. clan diplomacy / influence
11. Saga / Legacy progression
12. realm-unification endgame
```

These systems do not all need to be implemented simultaneously.

They define the intended destination and provide a framework for deciding what each prototype should prove.
