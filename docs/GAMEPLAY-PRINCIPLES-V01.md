# Pillagers — Core Gameplay Principles v0.1

> **Status:** Canonical gameplay foundation
>
> This document defines the core gameplay contract for Pillagers. Individual mechanics may evolve, but new systems should support these principles rather than work around them.
>
> The intended development approach is to build these systems **layer by layer**, validating each layer before adding the next.

---

# 1. Core fantasy

Pillagers is a **living-clan build simulation with RTS elements**.

The player begins with a small Viking / North Sea-inspired community and guides it across multiple generations into a powerful regional realm.

The world is not made of disposable RTS units. Every persona is an individual with:

- a name;
- age;
- sex;
- DNA / inherited traits;
- appearance;
- personality traits;
- family relationships;
- partner / household relationships;
- occupation and skills;
- personal history;
- loyalties and social connections.

The central fantasy is:

> **Build a people, not an army.**

Characters should matter during their own lifetime and through the generations that follow them.

Conceptually:

```text
people
→ families
→ clan
→ settlement
→ multiple settlements
→ realm
```

---

# 2. Ultimate objective

The long-term campaign objective is:

> **Grow a small clan into the dominant realm and ultimately unite the region under its rule.**

Working end-state concept:

> **Unify the Realm**

The final political expression may eventually be recognition of the player's realm / current chief as the dominant regional authority, for example a High Chief or High King.

Control of the region does **not** require every rival community to be destroyed.

A rival clan or settlement may become part of the player's realm through:

- conquest;
- annexation;
- submission;
- tribute / vassalage;
- alliance;
- political marriage;
- gradual integration.

This gives combat, prosperity, diplomacy, lineage and settlement growth a common purpose.

---

# 3. Failure condition

A chief dying is **not** game over.

A settlement being lost is **not automatically** game over.

The campaign ends when the player's clan / realm can no longer meaningfully continue: there is no surviving community, successor or recoverable clan structure left under the player's control.

This allows major setbacks and comeback stories.

A realm may collapse back into a tiny surviving settlement and continue.

---

# 4. The player's role

The player is **not an omnipotent god controlling every human action**.

The player is best understood as:

> **The enduring will of the clan, expressed through its current chief.**

The current chief is a real simulated persona:

- born from the same character system;
- has DNA and traits;
- has parents, children and relatives;
- forms relationships;
- has an occupation / role;
- ages;
- can fight;
- can be injured or killed;
- eventually dies.

When the chief dies, leadership passes to a successor rather than ending the campaign.

The player therefore persists across generations while the in-world authority of the player is represented by the current leader.

## What the player controls directly

The player's strongest direct agency should be at **strategic and community level**:

- building placement and upgrades;
- settlement priorities;
- resource allocation;
- exploration targets;
- founding or taking settlements;
- manual occupation assignment;
- military mobilization and objectives;
- important diplomatic decisions;
- prisoner / defeated-enemy policy;
- selected high-impact marriage or succession decisions;
- broad cultural / community policies later.

## What the player normally does not control directly

The player should not need to manually control:

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

# 5. Core interaction principle

## Autonomous by default, controllable by choice

This is the main interaction rule for Pillagers.

> **The simulation should make sensible decisions on its own, but the player may intervene where the decision matters to them.**

The player should never be forced to micromanage every character simply to keep the settlement functional.

At the same time, autonomy must not make the player feel like a spectator.

Examples:

### Occupations

Default:

```text
community detects demand
→ evaluates available people
→ assigns suitable occupations
```

Player intervention:

```text
select persona
→ assign / change occupation manually
```

### Relationships

Default:

```text
people meet
→ familiarity develops
→ compatibility / attraction develops
→ relationships form
→ households emerge
```

Player intervention may later include:

- arranging strategically important matches;
- encouraging political marriages;
- relocating households;
- influencing social opportunities;
- defining cultural marriage rules.

### Settlement economy

Default:

```text
workers perform their occupations
→ resources flow through the settlement
→ community demand influences future work allocation
```

Player intervention:

- choose buildings and projects;
- establish priorities;
- change production focus;
- assign important specialists.

### War

Default:

Characters live ordinary lives until mobilized.

Player intervention:

- form a warband;
- choose participants where desired;
- choose target;
- issue strategic / tactical orders;
- decide what happens after victory.

This rule should scale from a community of 15 people to a realm of hundreds without requiring exponentially more clicks.

---

# 6. The three core gameplay pillars

All major mechanics should primarily strengthen one or more of these pillars.

## A. Sim Life

Individuals are born, grow up, form relationships, contribute to the community, age and die.

The settlement continually renews itself through generations.

Core systems:

- birth and childhood;
- aging;
- matchmaking / relationships;
- households;
- reproduction;
- occupation assignment;
- skills / aptitude;
- social relationships;
- inheritance / DNA;
- death;
- succession.

## B. Community Building

The player grows and organizes settlements into a functioning society.

Core systems:

- housing;
- construction;
- building upgrades;
- food and resources;
- occupations;
- production chains;
- community needs;
- defense;
- exploration;
- expansion;
- new settlements;
- trade / exchange.

## C. Conflict, Conquest & Integration

Communities compete for land, people and resources.

Core systems:

- raids;
- combat;
- defense;
- settlement attacks;
- destruction;
- conquest;
- surrender;
- captives;
- slavery;
- execution;
- release / ransom;
- integration;
- tribute / submission;
- alliances and diplomacy.

The important principle is that defeated people remain **people**, not simply loot values.

A former enemy may later become:

- a slave;
- a worker;
- a spouse;
- a respected craftsperson;
- a warrior;
- a parent of future clan members;
- a source of resentment or rebellion.

Conflict therefore changes the population itself.

---

# 7. Persona lifecycle

Every person belongs to the same generational simulation.

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

The exact age boundaries can be tuned, but all systems should treat age as meaningful state rather than cosmetic data.

---

# 8. Birth and early childhood

Characters exist in the simulation from birth.

For performance and asset-scope reasons, very young children do not need to exist as full world agents.

Current intended model:

```text
Age 0–4/5
→ household child
→ exists in population / DNA / family simulation
→ consumes food
→ occupies household capacity
→ linked to parents
→ does not require a visible autonomous 3D persona

Age 5+
→ visible simulated child persona
→ enters the world using the Character Lab / universal character pipeline
```

The Character Lab currently supports approximately age 5–6 and upward. The exact visible-child threshold can remain configurable while that system develops.

Young children should therefore still matter economically and genealogically even while they are not rendered as independent agents.

---

# 9. Matchmaking, households and reproduction

Matchmaking should primarily be **emergent**, not manually managed by the player.

Eligible personas naturally encounter one another through:

- settlement proximity;
- occupations;
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

For biological reproduction, compatible male/female adults can form child-bearing partnerships, subject to kinship and fertility rules.

Relationships should develop over time rather than instantly.

Simplified flow:

```text
meet
→ familiarity
→ compatibility / attraction
→ partnership
→ shared household
→ possible children
```

Children inherit traits through the DNA system.

The important gameplay outcome is that population growth creates **families and bloodlines**, not anonymous new villagers.

## Player influence over matchmaking

The player should normally **not** choose every couple.

However, high-impact relationships may be influenced or arranged, especially for:

- alliances;
- succession;
- important families;
- diplomatic marriages;
- integration of other clans.

This preserves the autonomy of ordinary life while giving the player control over strategically meaningful relationships.

---

# 10. Households

Households are the bridge between family simulation and settlement building.

A household can contain some combination of:

- partners;
- young children;
- visible older children;
- dependent relatives;
- possibly servants / slaves later.

Housing therefore matters because it affects:

- population capacity;
- family formation;
- reproduction;
- childcare;
- settlement expansion;
- household stability.

The player builds housing capacity, while the simulation normally determines who lives together.

Direct household reassignment may be available as an override later, but should not be required for ordinary play.

---

# 11. Family, caregiving and work

Family life and occupations should interact.

Pregnancy, infancy and caregiving can temporarily reduce a persona's availability for ordinary occupation work.

Initial design direction:

- a mother with a very young household child may spend more time in household / caregiving state;
- women without a partner or young-child caregiving responsibility can participate normally in the occupation pool;
- as children become older and visible, caregiving pressure can reduce;
- exact labour division should remain tunable and may later be influenced by culture rather than permanently hard-coded.

The architecture should therefore model **availability**, not simply classify characters as permanently working or non-working by sex.

---

# 12. Occupations

Occupations connect the individual simulation to the settlement economy.

The community continuously evaluates what work is needed.

Conceptually:

```text
community demand
× persona aptitude
× DNA / physical traits
× personality
× existing skill
× age
× availability
× local opportunity
→ occupation preference / assignment
```

Examples of community demand:

- food shortage → more farmers / fishers / hunters;
- construction backlog → more builders;
- military threat → more warriors / guards;
- resource discovery → miners / gatherers;
- production bottleneck → specialist craftsperson.

Characters should have different suitability for different jobs because of their traits, skills and experience.

Occupation assignment should therefore not be purely random.

## Automatic assignment

If the player does nothing, the community should remain capable of organizing itself.

Example:

```text
Food need rises
→ settlement evaluates available adults
→ suitable persona becomes fisher
```

## Manual assignment

The player may explicitly override the automatic choice for an individual persona.

Example:

```text
community wants another farmer
but player selects Einar
→ Assign occupation: Blacksmith
```

This may be strategically better or worse depending on Einar's aptitude and the current needs of the settlement.

This is a core example of **autonomous by default, controllable by choice**.

## Occupation progression

Later versions may allow experience, rank or mastery to accumulate over a lifetime.

A persona should ideally become more valuable in a profession through repeated work, creating a cost when a skilled individual dies or is pulled into war.

---

# 13. DNA must affect gameplay

The DNA / character-generation system must not remain purely visual.

Inherited traits should eventually influence probability and aptitude across systems such as:

- occupation fit;
- physical work;
- combat;
- social behavior;
- leadership;
- risk tolerance;
- matchmaking compatibility;
- skill development;
- longevity / health where appropriate;
- descendants.

DNA should influence outcomes without making characters completely deterministic.

A strong persona may be well suited to combat but still become a farmer.

An intelligent persona may be well suited to specialist work but still develop differently because of opportunity, family or player intervention.

The simulation should combine **nature, experience and circumstance**.

---

# 14. Aging and generations

The simulation is generational by design.

Current core time scale:

```text
1 real-time minute = 1 in-game year
```

Aging therefore happens at a pace the player can observe within a normal play session.

The target experience is that the player sees:

```text
children
→ adults
→ parents
→ elders
→ death
→ descendants taking their place
```

within the same campaign.

A full campaign should span multiple generations.

Every system should therefore be evaluated by two questions:

1. What does this mechanic mean to a character now?
2. What does this mechanic change for the generations that follow?

---

# 15. Annual simulation heartbeat

The current prototype rule is:

```text
1 year = 60 real-time seconds
```

Current Fjordside prototype start year:

```text
1200 DC
```

The annual clock is a central simulation heartbeat.

Long-term systems may use annual or sub-annual events for:

- aging;
- fertility;
- birth;
- childhood transitions;
- health;
- death probability;
- occupation eligibility;
- settlement needs;
- household changes;
- succession;
- progression milestones.

The simulation clock must remain independent from how time is visually represented.

Day/night or seasonal visualizations are presentation layers, not the source of simulation time.

---

# 16. Settlement and community building

The player's main direct control is strongest at the community level.

The player should be able to influence:

- what is built;
- where it is built;
- what is upgraded;
- settlement priorities;
- resource allocation;
- defenses;
- exploration targets;
- expansion locations;
- new settlements.

Whenever practical, the player specifies **intent**, while people perform the actual work.

Example:

```text
player approves a longhouse project
→ required resources are identified
→ builders acquire materials
→ builders travel to site
→ construction happens in-world
```

This preserves the feeling that the settlement is inhabited by autonomous people rather than controlled drones.

---

# 17. Needs and economy

The economy exists to support people and expansion, not simply to generate abstract numbers.

Resources should connect to concrete community needs such as:

- food;
- shelter;
- warmth;
- tools;
- weapons;
- building materials;
- transport;
- defense.

Economic pressure should feed back into life simulation.

Examples:

```text
food shortage
→ community demand for food occupations rises
→ player can intervene or let the settlement adapt
→ persistent shortage creates demographic / social consequences
```

```text
new housing
→ greater sustainable population
→ more households can form
→ demand for food and jobs rises
```

The economy should therefore behave as a living system rather than a disconnected RTS resource bar.

---

# 18. Exploration and expansion

The world is not fully known at the start.

Exploration reveals:

- resources;
- terrain;
- defensible locations;
- other settlements;
- rival clans;
- opportunities for trade;
- opportunities for conflict;
- possible expansion locations.

Expansion may happen through:

- enlarging the original settlement;
- founding new settlements;
- taking over existing settlements;
- integrating allied or subordinate settlements.

A growing realm should eventually become a network of communities rather than one endlessly expanding village.

---

# 19. Combat

Combat is an RTS layer built on top of the life simulation.

Warriors are not spawned military units. They are existing people who have:

- families;
- occupations;
- traits;
- skills;
- equipment;
- personal histories.

Calling people into a warband therefore has an economic and social cost.

A warrior who dies is not simply replaced by spending a resource.

Their death may remove:

- a parent;
- a partner;
- a specialist;
- a future successor;
- a bloodline member;
- an experienced fighter.

This is one of the main ways the DNA/life simulation becomes meaningful gameplay.

---

# 20. Defeat, surrender and captives

After conflict, the player may eventually have several possible policies toward defeated enemies.

Examples:

- kill;
- enslave;
- ransom;
- release;
- integrate;
- demand tribute;
- absorb the settlement.

These decisions should have long-term consequences.

Examples:

```text
integrate captives
→ population grows
→ new skills / DNA enter the clan
→ possible loyalty problems
```

```text
execute captives
→ fewer immediate internal risks
→ fear / hatred / diplomatic consequences
```

```text
enslave captives
→ labour increases
→ social tension / escape / rebellion risk
```

The system should allow former enemies and their descendants to become part of the future population.

---

# 21. Succession and leadership

Leadership is generational.

The chief is expected to die eventually.

A successor must emerge through a succession system.

Possible future factors:

- bloodline;
- cultural succession rules;
- age;
- reputation;
- military prestige;
- family support;
- settlement support;
- player preference.

The player may influence succession, but the social simulation should be able to create resistance.

A succession decision may create:

- loyalty;
- rival claimants;
- factions;
- family conflict;
- settlement division;
- civil conflict.

This turns large successful realms into socially more complex systems rather than simply easier versions of small settlements.

---

# 22. Growth should create complexity

A larger population is not purely an upgrade.

The desired difficulty curve is:

```text
small clan
→ easy to understand
→ limited capacity

large clan
→ powerful
→ economically, socially and politically more complex
```

Growth may introduce:

- competing families;
- settlement leaders;
- influential specialists;
- rival claimants;
- integrated outsiders;
- social classes / status;
- conflicting local needs;
- loyalty problems.

This is preferable to scaling difficulty only through enemies with larger health pools or inflated resource bonuses.

---

# 23. Progression: Saga / Legacy tree

Campaign progression should acknowledge **how** the clan grows without forcing one linear route.

Working branches:

```text
Prosperity
Conquest
Influence
```

These names are placeholders and can evolve.

## Prosperity route

Examples:

- population milestones;
- stable food surplus;
- specialist economy;
- multiple settlements;
- trade network;
- wealth / infrastructure.

## Conquest route

Examples:

- successful raid;
- rival warband defeated;
- settlement captured;
- enemy chief defeated;
- tributary community established.

## Influence route

Examples:

- alliance created;
- political marriage;
- enemy integrated peacefully;
- another clan submits without destruction;
- multiple clans tied into the realm.

These routes are **not mutually exclusive classes**.

A successful realm will probably use elements of all three.

Higher progression nodes may require combinations of achievements from several branches.

The tree should describe the emerging history of the clan rather than function as a traditional XP skill tree.

---

# 24. Relationship between progression and victory

The Saga / Legacy system provides medium-term objectives.

The ultimate objective remains:

> **Unify the Realm.**

The progression structure should guide the player toward regional dominance through different styles rather than introduce multiple unrelated victory conditions.

Avoid separate disconnected win conditions such as:

- economic victory;
- military victory;
- diplomatic victory.

Instead:

```text
prosperity
conquest
influence
→ different routes contributing to one larger realm-building objective
```

This keeps the game's scope focused.

---

# 25. Core gameplay loop

The high-level Pillagers loop is:

```text
SURVIVE
↓
GROW
↓
SPECIALIZE
↓
EXPLORE
↓
ENCOUNTER
↓
COOPERATE / COMPETE / CONQUER
↓
ABSORB PEOPLE, LAND AND RESOURCES
↓
NEW GENERATION
↓
DEAL WITH INTERNAL CONSEQUENCES
↓
REPEAT
```

Over time:

```text
people
→ families
→ clan
→ settlement
→ multiple settlements
→ realm
```

---

# 26. What makes Pillagers different

Pillagers should not become simply Age of Empires with Viking visuals.

The defining difference is:

> **Every strategic system is connected to a persistent population of individuals and bloodlines.**

A raid does not just produce resources.

It may also:

- kill someone's parent;
- create widows / widowers;
- remove a settlement specialist;
- produce captives;
- introduce new DNA;
- create revenge relationships;
- create future political claims.

A marriage does not just provide a bonus.

It may:

- connect two families;
- produce heirs;
- change alliance structures;
- spread lineage between communities.

A settlement is not just a production base.

It is a home occupied by families who persist across generations.

---

# 27. Emergent history

The player's campaign should generate a history unique to that world.

The simulation should make stories like these possible:

- the child of a captured enemy becomes a respected craftsperson;
- two families become rivals across several generations;
- a war kills several members of one bloodline and changes succession;
- a political marriage prevents a war;
- a small settlement becomes the center of the realm decades later;
- descendants of the founding population still occupy important roles many generations later.

The game should remember enough of these events that people feel connected to the history that created them.

---

# 28. Design filters for future mechanics

Before adding a major mechanic, ask:

## 1. Does it strengthen one of the three gameplay pillars?

- Sim Life;
- Community Building;
- Conflict / Integration.

## 2. Does it create meaningful player agency?

The mechanic should create a decision, priority or consequence rather than pure busywork.

## 3. Can the simulation handle the default case autonomously?

If the player ignores the system temporarily, the community should normally remain functional.

## 4. Does the player have a meaningful override when they care?

Important decisions should allow intervention.

## 5. Does it matter across generations?

The strongest Pillagers mechanics create consequences that survive individual characters.

## 6. Does it contribute to the realm-building objective?

If a mechanic does not support survival, growth, specialization, relationships, expansion or control of the region, it should be challenged before being added.

---

# 29. Scope principle

Pillagers can become extremely broad very quickly.

Therefore:

> **Depth comes from interaction between a small number of systemic mechanics, not from adding an endless number of isolated features.**

The development strategy should build the game layer by layer.

Suggested sequence:

```text
1. simulation clock / aging
2. autonomous persona lifecycle
3. households / matchmaking / reproduction
4. occupations / community needs
5. housing / settlement economy
6. construction / expansion
7. relationships between communities
8. combat / raids
9. captives / integration
10. succession / political complexity
11. Saga progression
12. full Unify the Realm campaign structure
```

Each layer should work with the previous layers before the next is added.

---

# 30. Canonical design statements

The following statements summarize the current gameplay direction:

> **Build a people, not an army.**

> **Autonomous by default, controllable by choice.**

> **The player is the enduring will of the clan, expressed through its current chief.**

> **Every persona is an individual, not a disposable RTS unit.**

> **DNA must affect gameplay, not just appearance.**

> **Growth creates power and complexity.**

> **Conflict changes the population, not just the territory map.**

> **A chief's death creates succession, not game over.**

> **Every generation inherits the consequences of the generation before it.**

> **Prosperity, conquest and influence are routes toward one goal: Unify the Realm.**

> **Depth should emerge from connected systems rather than feature count.**
