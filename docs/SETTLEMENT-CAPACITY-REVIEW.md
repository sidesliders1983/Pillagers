# Settlement capacity review - #134 / PR #139

## Current requirement stays in force

Both regions must fit all six authored reference parcels, including the large Farmyard. No acceptance threshold, asset size, setback, 160m center separation, 40m construction gap, 240m route, harbor requirement or 0.6m cut/fill limit has been relaxed. This review does not authorize a smaller settlement.

## Founding day and expansion are different contracts

`src/simulation/Landing.ts:createCampaign` creates ten residents, one longship, three cattle and **zero permanent buildings**. There are initially ten tent households; up to three existing couples combine homes, giving seven to ten occupied tents. The measurement records the actual counts for each fixed seed directly from this public factory.

The six parcels in `src/world/SettlementLayout.ts` are the Lab's visual reference assembly: great house, longhouse, homestead, hut, small Farmyard and large Farmyard. They represent several construction/upgrade states simultaneously. Six such parcels are therefore neither six founders nor proof that every founding household can be placed.

The active Fjord presentation currently reserves 15 x 15m plots even for tents, so that construction can retain a location (`src/fjord-play/FjordProjection.ts:allocatePlot`). Island placement is still opt-in in the Lab and does not change that campaign allocator. This PR must not claim that six Lab footprints validate seven to ten gameplay plots.

## What the measurements establish

The refined search records every candidate's best partial placement, available physical poses by parcel and complete six-parcel fits by geographical compartment. All accepted worlds meet the original six-parcel requirement in both regions. Rejected worlds are not declared geologically impossible: the bounded search is conservative.

In four rejected seeds, complete fits do not form a separated pair, while other compartments commonly reach four or five parcels in this search. Expansion-space packing remains limiting there. Seed 104 additionally demonstrates that foundation fit alone cannot guarantee usable access and hiddenness. The report gives the actual per-seed breakdown. A partial placement is **not** an accepted founding site and does not imply that a four/five-parcel variant would pass all other checks.

## Alternatives requiring a separate owner decision

1. Keep the present stress case and improve search coverage further (more positions/packing alternatives, with a measured generation-time tradeoff). No balance change is required; the six-parcel contract remains intact.
2. Define distinct founding and expansion reservations from the real campaign: prove seven to ten initial household plots, campfire, cattle and landing space, plus separately measured upgrade/expansion capacity. Reuse current campaign dimensions and migration rules. This could be more accurate and sometimes **stricter**; its yield must be measured before adoption.
3. A staged four/five-building expansion requirement could be studied only after explicit approval. It would change the acceptance contract and would still need separate tent/cattle capacity, navigation, harbor and LOS validation. This PR does not implement it or predict its acceptance percentage.

Reducing parcel dimensions, widening the grading limit, manufacturing a settlement plateau or silently choosing another seed are excluded alternatives.
