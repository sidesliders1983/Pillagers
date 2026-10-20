# Livestock v0.1B — founding and balance trials

Issue #219 builds on [v0.1A](LIVESTOCK-V01A.md). The original six-species study remains an explicit trial contract. On 20 October 2026 the owner extended [#238 campaign entry](CAMPAIGN-START.md) to activate **cattle, pig, sheep and goat** for fresh Fjord scenarios. `src/config/FjordLivestock.ts` copies this soft-crowding candidate's coefficients unchanged and saves that four-species founding pool. Chicken and goose are deferred. Existing campaigns retain their own saved rules; historical study reports are unchanged. The supplied models are integrated in the [#220 presentation slice](LIVESTOCK-V01C-PRESENTATION.md); crafting and equipment remain #221.

## Canonical founding factory

The explicit `CampaignLivestockRules` creation option stores `landing.livestock.version = 2`. Its separate `founding-livestock-v1` seeded stream chooses from the saved `founding.species` pool. Without that optional field the original six-species contract remains unchanged. The factory creates exactly two adult females and one adult male before recording the landing event. Their age is the greater of their species' adult and minimum fertile ages. They have immutable IDs, no invented parents, founding origin and real factual identity records. Human DNA, names, couples, domestic RNG and terrain generation do not draw from this stream.

Graph neighbours independently draw from the saved species pool (all six in the original trial; four in new Fjord scenarios). Only initial physical two-clan island binding excludes the player's species from the CPU's pool; the rival's saved contract records that exclusion. This policy does not reserve or guarantee species for further clans or future multi-island modes. Player Food remains 15. CPU Food remains its actual saved Landing configuration, ordinarily 30. There are no purchases, extra grants or generated replacement animals after founding.

Loading never calls the factory. Earlier saves retain their livestock, species omissions, IDs, progress, history and published book. Missing species still means cattle. Saved-rule restart preserves explicit player and CPU profiles/configuration and uses the saved founding contract; a same-seed restart reproduces the founding trio. A changed-seed restart resamples under that same contract. A genuinely new Fjord scenario uses the approved four-species pool; the generic Core/Lab default remains cattle unless given explicit rules. Version-1 explicit profile fixtures remain supported without silently adopting version-2 guards.

## Explicit breeding and space rules

The trial saves three breeding parameters: `requireFed`, `capacityLimited` and `unassignedCapacityUnits`. After rejecting the strict-cap pilot, the current candidate enables the feeding guard, leaves `capacityLimited` **false**, and gives the shared outdoor herd a **soft** capacity of 40,000 occupancy units, equivalent to four existing cattle spaces. Overcrowding raises mortality; it does not impose a hard founding/herd population limit. These coefficients were activated unchanged for new four-species Fjord scenarios by the owner under #238; they remain experimental balance values.

When `requireFed` is enabled, a real human or livestock feeding shortfall at the current annual boundary prevents new livestock births. This consumes no birth/sex roll and does not kill existing animals. It does not alter the existing human fertility reserve policy or Food order. The guard reads actual feeding events rather than persisting a second feeding status.

When `capacityLimited` is enabled, the mother's existing herd must have room for the young animal's species weight. Each successful birth occupies that space before the next mother is assessed. Mates must still be mature/fertile, same-species and in the same herd. Different Farmyards remain separate herds. Outside animals use their saved shared capacity for both breeding and overcrowding risk; they no longer bypass all space pressure. Existing assignment remains a soft cap, and no animal is deleted to enforce it. Earlier rules keep their original feeding, crowding, birth and RNG behavior.

## Specialist Hides contract

`specialistStocks = {version: 1, hides: integer}` is an optional clan-owned stock for the future #221 crafting consumer. It is created lazily when a positive receipt occurs. It does not extend the universal `stocks` object or the Food/Materials HUD. No equipment, Smithery, Leatherworker, recipes, wildlife conversion or raid-transfer extension is implemented here.

The explicit trial's six-species Hides table proposes one whole Hide from actual adult cattle/pig/sheep/goat slaughter, zero from chickens/geese, and zero from young animals. Actual slaughter credits Food and Hides once, retains the dead animal and records the exact receipt on that event. Repeating the command is rejected. Natural death never credits Hides. Old slaughter events are not reinterpreted and old rule sets receive no retroactive byproducts. Management previews, confirmation and the factual Chronicle disclose the actual receipt; no Hides production popup or third HUD stock is added. The four-species Fjord start adopts this table with the owner’s #238 approval; historical trial outputs retain their original rules.

## Measurement contract

The bounded real-Core harness lives in `scripts/qa/run-livestock-study.mjs`; experimental coefficients live in `livestock-candidates.mjs`. Production does not import the QA module; the approved four-species Fjord configuration copies that candidate explicitly without changing the historical record. Cattle retain their existing saved Landing coefficients as the control; the seeded cattle trial adds the new guards. The other five full profiles are explicit experimental values, not claims about real-world husbandry.

Compare the same seeds from Summer 800 for 40 complete 1,000-tick years, with ordinary configured annual weather and independent CPU progress. Record the actual realized weather: species change domestic RNG consumption, so identical weather configuration is **not a promise of identical realized weather sequences**. Interpret the multi-seed results accordingly, alongside direct guard contracts and the unchanged-cattle control.

Policies:

- **Passive/autonomous:** no player commands; existing career, family and housing autonomy continues.
- **Prepared:** the frozen #78 Food/housing policy, with livestock assignments disabled to isolate housing/work from herd management.
- **Herd:** the same Food/housing preparation, a compatible breeding herd in one real Farmyard when available, mature breeding males retained before juveniles, surplus adult males/older adult females slaughtered through real commands, and young replacements retained within real weighted capacity. This is a documented management strategy, not new autonomous gameplay.

CPU clans receive no player preparation, resource reset or subsidy. Their autonomous trajectories can be reused across player policies only when canonical initial economic state and horizon match. Cache entries omit only the founding exclusion from the *cache key*, since it affects founding selection rather than subsequent economics; returned states retain the actual saved exclusion. Entries are bounded and compressed. A full-world oracle checks annual results and exact final canonical serialization, including CPU RNG/events and save/load. Runtime/memory/herd budgets stop observations and report limits; they never cap a canonical herd.

Each observation stores source/adapter/policy/candidate hashes, full saved rule configurations, initial founder fingerprint, annual human/livestock outcomes, Food/Materials/Hides receipts and spending, young feeding counts/base costs, shortfalls, herd size/crowding and exact stock/herd residuals. Descendants who reached adulthood include people who later died; historical age stops at their actual recorded death. Canonical Core currently has no Food-spoilage rule; measured spoilage is explicitly zero. Historical reports are preserved.

The final report must present all completed and truncated cases, species-specific survival/shortage and herd outcomes, CPU results and a concrete coefficient/threshold recommendation for owner review before default activation. Browser evidence covers existing friendly designations, species/sex details, weighted rosters and actual slaughter receipts on desktop and touch layouts. Missing #220 meshes are not substituted with cattle.
