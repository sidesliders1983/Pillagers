# Pillagers Simulation Run #002 — Demography + Food + Materials

Status: design simulation, manually executed in chat.
Period: legacy notation 1200–1250.

> Canonical calendar note: Pillagers now starts at **Winter 800**, with one simulation year running winter-to-winter and ages expressed as **winters**. This run keeps its original 1200-series labels as historical design-run notation; the equivalent canonical interval would be Winter 800–850.
Purpose: keep the same demographic foundation as Run #001, add two resources, and observe whether simple resource constraints generate emergent settlement behavior.

## Same start population

Uses the same 12 founders and initial social/occupation state as Run #001.

## Resource rules

### Food

Starting Food: 20.

Production:
- Farmer: +4 / year
- Hunter: +3 / year
- Fisher: +3 / year
- Woodcutter: +0 Food

Consumption:
- Adult: -2 / year
- Child: -1 / year

Shortage effects:
- first consecutive shortage year: fertility disabled;
- second shortage year: fertility disabled + elevated mortality;
- third+ consecutive shortage year: stronger mortality pressure;
- shortage streak resets when Food is sufficient.

Values are prototype placeholders, not historical claims.

### Materials

Starting Materials: 20.

Production:
- Woodcutter / material creator: +2 Materials / year at full productivity.

Housing:
- Build permanent house for a household: 10 Materials once.
- Permanent house upkeep: 1 Material / year.
- Tent: 0 Material upkeep.
- Tent residents produce at 50% productivity.
- If a permanent house misses upkeep for 3 consecutive years, it collapses.
- Collapse converts household residence to Tent.
- Collapse salvages 50% of original build cost: +5 Materials.
- If >=10 Materials are available, the oldest tent-household is upgraded first (FIFO).
- Existing permanent houses in year 1200 are treated as already built; only upkeep applies.

Partnerships are not blocked by missing Materials.
A new household without sufficient Materials begins in a Tent.

## Important correction discovered during the run

Olaf already starts with H4, so when Ingrid partners with Olaf she moves into H4 rather than requiring a new house.

## Key economic events

1201
- Ingrid joins Olaf’s H4.
- No construction cost.
- Materials decline because 4 houses require 4 upkeep while Torsten produces only +2.

1202
- Leif reaches adulthood and becomes Woodcutter.
- With Torsten + Leif, Materials production becomes +4/year, exactly covering 4 houses.

1203–1206
- Population grows while Materials remain roughly neutral.

1207
- Hakon + Freya form a new household.
- 10 Materials spent to create a permanent house.
- Settlement moves into structural Materials deficit: production +4 versus 5 upkeep.

1208
- Torsten dies.
- Material production drops to +2/year.
- Materials rapidly approach zero.

1210
- First maintenance shortage recorded because available Materials cannot cover all house upkeep.

1212
- Yrsa reaches adulthood.
- Because Materials are critical, she becomes Woodcutter instead of Fisher.
- Leif + Yrsa form a new household in a Tent due to insufficient Materials.
- H4 and H5 reach 3 years of missed upkeep and collapse.
- Collapse salvages +5 Materials each (+10 total).
- FIFO rebuild uses the salvage to restore H4 immediately.
- End state: H1/H2/H3/H4 houses; H5/H6 tents.

1213
- Runa dies and H3 dissolves.
- H3 house becomes conceptually vacant, but Run #002 does not yet model persistent vacant buildings.
- Materials production/upkeep balance becomes tight.

1215
- H4 collapses again after another 3-year unpaid-upkeep streak.
- +5 salvage.
- Settlement stabilizes in a low-investment state with 5 Materials stock but insufficient reserve to rebuild.

1216–1218
- More births continue.
- Tent productivity keeps material and food output suppressed.

1219
- Liv reaches adulthood.
- Because Materials remain the dominant constraint, Liv becomes Woodcutter.
- Sigrid dies; H1 dissolves.
- Material pressure starts easing.

1220
- Arne reaches adulthood and becomes Woodcutter.
- Total Material production finally reaches enough surplus to hit 10 Materials.
- H5 is rebuilt via FIFO.
- Arne + Liv form a new partnership/household but begin in a Tent because the rebuild consumed the stock.

## Longer stability run: 1220–1250

No new mechanics were added during this extension.

Observed pattern:
- Materials shortages caused multiple younger residents to choose Woodcutter instead of Food occupations.
- Housing recovery increased productivity, which accelerated further recovery.
- Too many long-lived Woodcutter assignments eventually created Materials surplus once the housing crisis passed.
- Food moved from surplus toward shortage when too much labor shifted to Materials and tent penalties reduced productivity.
- Food shortage suppressed fertility and pushed the next occupation assignments back toward Food.
- The settlement therefore exhibited a rough endogenous cycle:
  population growth → resource pressure → occupation response → lower growth → worker maturation → recovery.
- By the 1230s/1240s, many workers were simulation-born rather than founders.
- Kinship became progressively more relevant as the partner pool increasingly consisted of related descendants.
- Intact but unoccupied houses became a visible model gap while some households still lived in tents.

## Structural conclusions from Run #002

### 1. Family != Household != House

The run produced a concrete case where an intact house could remain after a household dissolved while another household lived in a tent.

Next model should separate:
- Family / lineage
- Household
- Residence
- Building

Tent can be a residence without a permanent building.
A permanent house should persist independently of household membership.
Tent households should be able to move into vacant houses before building new ones.
Vacant permanent houses pay no upkeep but now accumulate one vacancy-maintenance debt step per winter; after 3 consecutive vacant winters they collapse and return 50% salvage of total invested Materials.

### 2. Occupations should not be permanent

Current “assigned at adulthood, forever” rule eventually creates oversupply.

Planned next direction:
- periodic occupation review (e.g. every 5 years);
- switching has consequences;
- previous occupation history should be retained.

### 3. Kinship needs explicit distance

Next rule:
- parent/child, grandparent/grandchild, siblings/half-siblings, aunt/uncle ↔ niece/nephew prohibited;
- first cousins and more distant relations allowed.

### 4. CharacterDNA should influence occupation fit

Planned Run #003 should use the existing canonical CharacterDNA traits:
- physicality
- agility
- intelligence
- cunning
- temperament

Occupation choice should combine:
- settlement need;
- CharacterDNA aptitude;
- parental occupation / family experience;
- current occupation experience;
- switching cost.

### 5. Family occupation experience

Having one or both parents with the same occupation should give a learning/apprenticeship advantage.
This is cultural/skill transmission, not genetics.

### 6. Occupation switching

Proposed:
- review every 5 years;
- only switch when alternative is clearly better;
- switching causes temporary productivity loss;
- occupation history is retained.

## Run #003 direction

Repeat 1200–1250 from the same 12 founders, but add:
- persistent Buildings / vacant houses;
- tent households move into vacant houses;
- first-cousin matchmaking allowed;
- real CharacterDNA for all 12 founders;
- occupation aptitude from CharacterDNA;
- parental occupation bonus;
- occupation experience/history;
- 5-year occupation review and switching penalty.

Run #003 should be the first simulation where existing Character Lab genetics materially affect gameplay.
