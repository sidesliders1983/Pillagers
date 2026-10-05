# 05 — Cattle (Simulator v0.3)

## CATTLE-001 — Farm module
**Status:** Canonical direction; values Prototype

> **As a player, I want cattle to be an optional Farm investment, so that livestock adds depth without becoming a separate management game.**

Rules:
- cattle only initially;
- require Cattle Pen;
- Pen I currently: cost 10, capacity 4, starter herd **2 cows + 1 bull**;
- Pen II/III increase capacity but spawn no cattle;
- no trade initially.

## CATTLE-002 — Living herd
**Status:** Canonical direction

> **As a player, I want cattle to reproduce and age as living assets, so that a herd has future value beyond current Food yield.**

Minimum state: id, sex, birthWinter/age, parents where applicable, calf/adult/old, alive/dead. Full animal CharacterDNA not required. Cow + bull enable reproduction within constraints.

## CATTLE-003 — Consumption/output
**Status:** Canonical direction; values Open

> **As a player, I want cattle to consume Food while providing ongoing value, so that a herd is an investment rather than free production.**

Cattle consume integer Food; calves less than adults; adult cows provide modest ongoing Food. Exact rates open.

## CATTLE-004 — Slaughter
**Status:** Canonical direction; yield Open

> **As a player, I want to slaughter cattle for immediate Food, so that I can sacrifice future production/breeding for survival now.**

Slaughter gives large one-off integer Food and permanently removes animal. Losing/slaughtering last bull stops reproduction.


## CATTLE-005 — Discrete visual lifecycle assets
**Status:** Canonical presentation principle; implementation pipeline Open

> **As a presentation client, I need animal age to map to a small number of deliberately authored lifecycle assets, so that animal anatomy can change convincingly without requiring the continuous Golden Human growth/proportion system.**

### Rules
- Animal age remains continuous canonical simulation state derived from `currentWinter - birthWinter`.
- Animal presentation uses discrete lifecycle geometry rather than continuous proportional mesh/skeleton deformation.
- Default conceptual lifecycle is:
  - **Young**
  - **Young Adult**
  - **Adult**
- Lifecycle stage is derived from species + age; it should not become an independent source of truth in save state.
- Sex-specific geometry is only required at stages where sexual dimorphism materially changes anatomy/silhouette.
- For cattle, the intended presentation mapping is conceptually:
  - Young → generic cattle asset;
  - Young Adult → generic cattle asset;
  - Adult female → adult cow asset;
  - Adult male → adult bull asset.
- Visible elder aging does not require another geometry stage. An Adult animal may progressively grey through shader/material parameters while remaining on its Adult asset.
- Exact stage age thresholds remain balancing/species parameters and are not fixed here.
- This principle does **not** prescribe modelling, Meshy conversion, topology cleanup, rigging, skeleton layout, animation production, or export workflow.

### Acceptance criteria
- Given a male and female cattle persona/entity at the Young stage, both may resolve to the same generic Young presentation asset.
- Given those same animals reach Adult, presentation may resolve to sex-specific cow/bull assets while canonical animal identity, parentage and birthWinter remain unchanged.
- Given an Adult animal ages into elder appearance, its geometry stage remains Adult while an age-derived greying parameter may increase.
- Changing presentation assets at a lifecycle boundary must not alter canonical simulation state.

### Rationale
Humans and animals deliberately use different presentation strategies. Humans use the Golden Human continuous growth/proportion system because continuous individual development is central to Persona identity. Animals use species-specific discrete lifecycle assets because anatomy may change non-linearly (for example horns/antlers or strong adult sexual dimorphism) and continuous deformation would add pipeline complexity without equivalent gameplay value.
