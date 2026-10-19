# Livestock v0.1A — Core and identity

Issue #218 is the first slice of #217. New player and CPU campaigns still begin with the existing two cows and one bull. No new species economics or founding selection is activated here. #219 owns measured, owner-reviewed coefficients and founding selection; #220 owns additional animal models and capture integration.

## One canonical animal model

The existing `LandingState.cattle` collection and immutable IDs remain authoritative. `LivestockAnimal` is its shared type; `Cattle` remains a compatible alias. An optional species discriminator supports cattle, chicken, pig, sheep, goat and goose. Missing species explicitly means legacy cattle. Age and life stage are derived from birth Winter and saved species thresholds, never stored as competing live state.

Fresh campaigns record `landing.livestock.version = 1` and an empty non-cattle profile map. Cattle continue using the campaign's saved Landing configuration. `configureLivestock` accepts complete, bounded non-cattle profiles only at the campaign's saved founding instant (including Summer 800, tick 500). It does not spawn or convert animals, draw RNG, select founding species or change resources. There are no guessed shipping defaults for the other five species. The synthetic coefficients in contract tests are fixtures, not balance proposals.

Each profile declares maturity, fertility ages/chance/interval, young/adult annual Food need, female/male Food and Materials production, exposed productivity, stage-specific slaughter yields, mortality age bands, weather/crowding risk and relative shelter occupancy. Production uses the existing integer progress scale (`ticksPerWinter × 10,000`), existing annual weather modifiers and the two existing stocks. Materials progress is saved only when needed. Split ticks, annual advancement and save/load preserve the same remainders.

Breeding requires a mature, fertile male and female of the same species in the same active Farmyard or shared unassigned herd. The young animal keeps both parent IDs, its species and its mother's assignment. Saved birth intervals remain authoritative. Death and slaughter retain the historical animal; slaughter awards its saved stage yield exactly once. No animal DNA, wildlife conversion, additional resource stock or separate breeding engine is added.

## Shared Farmyard capacity

A Farmyard remains a permanent household home containing a living farmer. Assignment has a soft cap. One cattle space equals 10,000 occupancy units; other species require explicit profile weights. Sum the living occupants' weights, then compare with `capacity × 10,000`. Overcrowding is excess space, not headcount; each animal's crowding risk is `floor(excessUnits × profile.crowdingBps / 10,000)`. The panel reports headcount and space separately. Cattle retain weight 10,000, so existing crowding behavior is unchanged. Losing the Farmyard function still unassigns its animals.

## Local titles and historical facts

`Livestock 1`, `Livestock 2`, etc. are derived from the clan's existing arrival/birth ledger, with deterministic fallback for older records. Titles are reserved after death or departure; imported ancestor-only snapshots do not consume local titles. IDs are never renamed. Species, sex, age, stage, parents and origin remain separate facts. Details use Cow/Bull, Hen/Rooster, Sow/Boar, Ewe/Ram, Doe/Buck and Goose/Gander.

New founding and lifecycle/assignment events freeze the local title and biological descriptor at event time. Routine production and feeding retain source IDs and exact quantities without duplicating the entire herd's identity metadata. Already saved logs and published chapters are not rewritten. Historical departures report the last observed age/status; they do not infer a former animal's current life from another clan's hidden state.

The factual Chronicle and management use friendly titles. Narrative passages group related species/life-stage/quantity facts, with exact receipts in the factual overview. New generic commands/events coexist with the old `AssignCattle`, `SlaughterCattle` and `Cattle*` contracts. The legacy collection/entity-kind names remain internal compatibility details.

## Presentation and compatibility

Management, selection cards, Farmyard rosters and the shared book/session work for explicit mixed-species fixtures independently of 3D assets. The current native renderer displays cattle only; it never presents another species as a cow. Additional meshes belong to #220.

Older saves acquire neither new species fields nor new event snapshots when loaded. An independent pre-change Core capture verifies canonical bytes after repeated, split and restored advancement, including legacy CPU and physical expedition state. New-campaign cattle economics, founder DNA and RNG remain unchanged; only versioned identity metadata is added.
