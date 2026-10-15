# 02 — Personas & Family

## PERSON-001 — Persistent identity
**Status:** Canonical

> **As a player, I want residents to remain identifiable across their lives and histories, so that births, work, relationships and deaths have lasting meaning.**

Rules:
- Personas are not population counters.
- CharacterDNA, life events and occupation history persist with the persona.
- Death ends active participation but not lineage/history.

## PERSON-002 — Age productivity
**Status:** Canonical behaviour; Prototype values

> **As a player, I want aging to gradually affect economic contribution, so that generations shift importance without a hard retirement cliff.**

Rules:
- Through 49 winters: 100%.
- From 50: -2 percentage points/Winter.
- Floor 50%.

Acceptance: age 50 = 98%; age 60 = 78%.

## PERSON-003 — Dominant genetic legacy
**Status:** Canonical; Prototype probability

> **As a player, I want children to sometimes inherit a recognizably strong parental trait, so that family lines develop visible genetic character.**

Rules:
- Each CharacterDNA trait independently has 25% dominant-legacy chance at birth.
- Strong inheritance comes from one parent.
- Dominant marker lasts one generation only.
- Numeric trait remains ordinary inheritable DNA afterward.

## PERSON-004 — CharacterDNA trait meanings
**Status:** Canonical semantics; occupation profiles remain Prototype values

The five existing traits describe tendencies, not assigned jobs or moral worth. They apply equally to all sexes and cultural heritages.

| Trait | Lower values | Higher values |
|---|---|---|
| Physicality | Less physical strength and force | Greater physical strength and force |
| Agility | Less dexterity and nimbleness | Greater dexterity and nimbleness |
| Intelligence | Less analytical and technical facility | Greater analytical and technical facility |
| Cunning | Less tactical and opportunistic tendency | Greater tactical and opportunistic tendency |
| Temperament | Calm, restrained, patient and steady | Impulsive, fiery, intense and quick to react |

High temperament never means calmness, discipline or generic “good temperament.” Each occupation has its own preferred values; higher trait values are not universally better. Aptitude is weighted closeness to that preference profile. Neither these definitions nor the #85 research changes current scoring, role vectors or campaign defaults.

## FAMILY-001 — Separate family, household, residence and building
**Status:** Canonical

> **As a simulation, I need kinship, domestic groups and infrastructure to persist independently, so that a family can outlive a house and a house can outlive a household.**

## FAMILY-002 — Children remain home until partnership
**Status:** Canonical

> **As a player, I want adult children to remain in their parental household until partnership, so that family labor and apprenticeship can persist across adulthood.**

## FAMILY-003 — Kinship limits
**Status:** Canonical

Prohibited: parent/child, grandparent/grandchild, siblings/half-siblings, aunt/uncle ↔ niece/nephew. First cousins and more distant kin are allowed.

## FAMILY-004 — Fertility
**Status:** Canonical behaviour; Prototype probability

Rules:
- partnered women 18–40 winters;
- 25% eligible annual birth chance;
- two complete cooldown Winters after birth;
- Food shortage may block fertility.

## FAMILY-005 — Childcare
**Status:** Canonical behaviour; Prototype duration

> **As a player, I want childbirth to create a labor trade-off, so that population growth has an economic cost and caregiver choices matter.**

Rules:
- mother normally produces 0% occupation output for 5 Winters in new campaigns; existing saves retain their configured period;
- later birth resets period;
- eligible adult woman with no occupation may take over;
- one caregiver per childcare situation;
- caregiver produces no occupation output and is not fertility-eligible that Winter;
- player may assign/replace caregiver.

Birth cooldown and care are independent: a birth at Winter 801 blocks birth opportunities at 802 and 803, with the next opportunity at 804 subject to existing fertility rules. Care lasts until 806 unless a younger child renews the group. Transferring care preserves both endpoints and assigns only the remaining care period. Explicit saved care settings/endpoints, including two-Winter playtest saves, are preserved on load and saved-rule restarts.


## PERSON-005 / FAMILY-006 — Individual birthday calendar (#171)
**Status:** Implemented as explicit review opt-in; owner acceptance required before default activation.

New campaigns explicitly choosing individual-v1 store a version-1 birthdayCalendar extension. Founders use an independent named seed stream for birthTick (0–999); birthWinter is the literal historical year adjusted to preserve the generated age at Summer 800:500. Collisions are valid. CharacterDNA.age is not mutated as the authoritative clock. Completed age, productivity, eligibility and projected visual age use personaAge. Deaths in this mode retain deathTick, and archived departure ages stop at the observed transfer time.

The annual tick-0 eligibility/probability decision remains once per year with the same configured chance and conditions. A success samples child DNA/parents and saves a delivery for tick 1–999 of that year. The actual child and ChildBorn event appear at delivery, with matching birthWinter/birthTick. No second fertility or Food check is applied. An away mother delivers on return; a transferred mother's pending plan and necessary parental identities follow her. Maternal death cancels the plan explicitly; paternal death/departure does not erase parentage. No conception or unborn-person life facts are narrated.

Care lasts the configured number of full years from actual delivery, to the same tick in the end year. Later delivery renews it. A helper starting her own care at delivery is released from her prior care group. Existing maternal fertility policy is preserved: own childcare does not add a new exclusion; saved birth cooldown and annual helper-participation exclusions still apply. Legacy care endpoints retain their tick-0 interpretation.

Annual economics, consumption, mortality rolls, weather, career/partnership reviews and Saga publication retain their existing schedule. They consult completed age at their execution tick. Birthday changes do not create additional mortality or career rolls. Large and single-tick advances process the same domestic and CPU-clan facts in the same order.

Old saves are not backfilled or migrated. Missing birthTick means tick 0. Missing birthdayCalendar means annual legacy births. An old clan receiving a foreign pending delivery stores only that delivery with birthPolicy annual; its own births and existing birthday dates retain their old rules. New/Restart preserves the explicit chosen policy. Import preserves the saved mode. Default new-game activation remains gated on review; the opt-in URL is /fjord-play?birthdays=individual-v1.
