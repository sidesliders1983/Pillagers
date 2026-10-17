# Fjordside desktop UI design v1

Desktop design proposal for [issue #180](https://github.com/sidesliders1983/Pillagers/issues/180). The player should complete coherent settlement tasks while keeping the world visible. Mobile layout belongs to [#182](https://github.com/sidesliders1983/Pillagers/issues/182).

The owner approved the interaction principles below. Screen placement, appearance and prototype variants remain proposals for review. The implementation baseline is branch codex/visual-foundations-180 at eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c. Reconcile newer main changes before implementation.

## Approved interaction principles

1. Show suitable residents and available assets as editable suggestions. Display every proposed change and its consequences before committing it. A suggestion is not an assignment.
2. Present one review for a combined task. Confirm irreversible actions. Apply routine, reversible actions directly when their consequences are clear, then show feedback.
3. After completion, retain the relevant object selection and replace the expanded task with a compact result. Keep details one action away.

Risk follows consequences. Changing a person's occupation can remove the last farmer from a home and unassign its cattle; that deserves an impact review even though another occupation change may be routine.

## Golden UI structure

The world remains the default surface. Navigation, selection and task execution have distinct states.

| State | Visible UI | Player purpose |
| --- | --- | --- |
| Observe | Compact calendar, stocks, clock controls, navigation and an attention indicator | Watch the settlement and notice problems |
| Inspect | Observe UI plus one compact selection summary | Understand a resident, household, building or animal |
| Act | One expanded task area containing choices, impact and its commit action | Complete a coherent task without switching among inspectors |
| Review risk | A focused review naming the exact subjects, cost and consequences | Confirm a combined or irreversible action |
| Result | Compact selection summary with the completed result | Resume observing or continue managing the same object |

Only one management area is expanded at a time. Choosing an eligible resident or animal within a task changes that task's choice, rather than discarding it and navigating to another inspector. Explicit inspect links can open details and return to the preserved draft.

Proposed placement:

| Area | Contents | Visibility |
| --- | --- | --- |
| Upper left | Clan identity, season and year | Persistent and compact |
| Upper centre | Food, Materials, Residents and Livestock, with icon, label and actual value | Persistent; each opens the relevant explanation or list |
| Upper right | Start/Pause, current pacing and Menu | Persistent; pacing reflects Expedition Mode restrictions |
| Lower edge | Settlement, Expeditions and Clan Book navigation, plus attention indicator | Compact controls rather than a permanent building catalogue |
| Selection area | Identity, current state, relevant relationships and a few actions | Appears on selection |
| Task area | Editable proposals, valid alternatives, actual costs, effects and confirmation | Expands for a task; one area at a time |
| Notifications | Grouped recent events with links to actual subjects | Opened on demand; urgent items receive a compact persistent signal |
| Menu | Save/load, campaign controls, settings, help and separated developer access | On demand |

The exact position of the selection and task areas is a prototype variable. A right inspector is the initial candidate. A large permanent minimap, objectives list or notification column would consume space without being necessary for every loop. Exploration should use the existing world view; any later map opens on demand.

The current Food and Materials counters are read-only. Their proposed drilldowns are new UI work: distinguish current stocks, recorded transactions and known production conditions. Do not label the last command's stock delta as annual income or invent reserve forecasts.

## Navigation and selection

Settlement opens named residents, households, buildings and livestock, with search/filtering as the lists grow. A person can be found even when indoors, very young, away or archived; presence and history must remain distinguishable.

World selection opens a compact summary. Expanded details contain secondary information such as lineage, occupation history, traits and personal history. Actions name the player intention, including Build house, Set up farmyard, Assign livestock and Change occupation.

Keep Household, Building, Occupation and Farmyard distinct according to [the glossary](../GLOSSARY.md). A Farmyard is a function of a permanent household home with a living farmer, not a separately placed structure. Building specialization is not the activation prerequisite.

Choosing a valid target should require one click when it is already displayed. Avoid placing both a dropdown and an Apply button between the player and every small decision. Large lists can use search, but its opening, typing and selection remain part of the measured journey.

Escape dismisses the current transient layer, retains the underlying selection and returns keyboard focus. Draft cancellation changes no proposed assignments. Existing committed expedition preparation retains its actual costs and cancellation rules. Reading, opening panels and reviewing drafts do not automatically pause or advance the simulation.

## Housing and work are separate

The initial mockup incorrectly made Set up farmyard the tent's main action. Replace that assumption with independent housing, person and building decisions:

| Subject | Decision | What it does not imply |
| --- | --- | --- |
| Household residence | Build a house or move to an available home | No occupation assignment, career lock, building specialization or cattle assignment |
| Individual resident | Keep an autonomous career or explicitly choose an occupation | Other household members do not receive the same occupation |
| Building | Inspect or choose its occupation specialization | A specialization does not assign residents' occupations |
| Active household function | Show what the actual residents and residence support | A permanent house is not automatically a Farmyard; a living resident farmer activates that function |

For example, the founding test household contains a hunter and a fisher. Building their house preserves both occupations and their career settings. A smith, fisher, hunter or other resident can share a home with someone in a different occupation. Housing is useful independently of farming.

The existing occupation registry contains farmer, herder, fisher, hunter, textileWorker, smith, woodworker, boatbuilder, trader and leatherAndJewelleryMaker. Render its English labels and actual command availability rather than defining a farming-only UI list. Future occupations should enter through the same work selection and detail pattern, with only their defined capabilities exposed.

The tent summary offers Build house with its actual cost and Manage work. Manage work shows each resident separately. The optional farmyard task lives there; it is not the tent's primary action. Task suggestions appear only after the player chooses that intention. Other occupation-specific combined tasks require their own journey design before implementation.

| Journey from no selection | Proposed pointer route | Budget |
| --- | --- | ---: |
| Build ordinary housing | Select tent, Build house with visible cost | 2 clicks |
| Assign a known resident to smith, fisher, hunter or another eligible occupation | Select resident, Change work, choose occupation | 3 clicks |
| Choose work through a household | Select household, Manage work, choose resident, choose occupation | 4 clicks |

Building a home for a household that already has a farmer preserves that occupation and activates the existing Farmyard function. It does not automatically specialize the building or assign any animals. Reusing an existing house in a later combined task must not charge for a second house.

## Farmyard journey

Farmyard is one optional combined task, not the default destination of a tent or household. The default inspection starts with housing and the residents' actual occupations.

Test state: no selection, visible occupied tent, sufficient Materials, an available household member to become a farmer, and exactly three eligible unassigned cattle. The chosen arrangement must respect canonical command availability.

Current source-derived physical-click route:

| Step | Clicks |
| --- | ---: |
| Select tent and Build house | 2 |
| Open specialization, choose farming role and Specialize | 3 |
| Select resident, open occupation, choose farmer and Assign occupation | 4 |
| Select animal, open farmyard, choose target and Assign livestock, repeated three times | 12 |
| Total including the owner's requested specialization | 21 |

The owner's reported baseline is 16 action steps, with dropdown selection counted as one step. Physical-click counting separates opening a dropdown and choosing its option. Without the optional specialization step, the current activation route is 18 physical clicks.

Proposed route when the player accepts the visible suggestions:

1. Select the tent.
2. Open Manage work.
3. Choose the optional Set up farmyard task.
4. Review and confirm the proposed home, farmer and three cattle assignments.

Changing the suggested resident adds one click when alternatives are directly visible. All three unassigned cattle are visible editable suggestions. The unchanged-suggestions path is four clicks and choosing a different farmer is five, preserving the owner's five-click budget without making farming the default. Additional custom changes are counted individually. These are design targets, not measured production results. Custom selection from a larger herd needs its own measurement.

The task shows housing cost and upkeep, the chosen person's current and proposed occupation, career autonomy consequences, cattle identities and the resulting shelter occupancy. If the setup includes farming specialization, name it in the same review without implying that specialization activates the Farmyard.

Preserve an already suitable farmer's current career settings unless the player explicitly changes them. Suggest unassigned animals; moving an animal out of another Farmyard requires an explicit choice and visible consequences.

The completed result retains the new home/Farmyard selection and states what succeeded. A validation failure preserves the draft and names the changed condition. Revalidate on commit. If existing command execution can only complete part of the task, report exactly what changed and what remains; never claim an atomic result without providing it.

## Livestock across species

Use Livestock as the navigation category. Its summary opens species groups and then the relevant animals or groups, showing only counts and assignments supplied by the simulation. The current review fixture contains cattle; future species must not appear as owned or available before their implementation.

The owner also requires room for goats, geese, chickens, horses and pigs. Their management shares an entry point, not necessarily the same rules:

| Concern | UI principle | Rule dependency |
| --- | --- | --- |
| Identity and quantity | Show species first, then the recorded individual or group | Species may use individual identities or a defined group model |
| Shelter and location | Offer suitable destinations for that species, with actual occupancy and consequences | Define eligible shelter, capacity units and any mixed-species limits |
| Household and work | Show the responsible household or occupation when the rules define one | Do not assume every species needs a farmer or a Farmyard |
| Production and care | Show actual food, care and outputs | Do not copy cattle output, consumption or the current four-cattle capacity onto other species |
| Transport and expeditions | A horse can also be found from vehicle/expedition preparation | Horse, wagon and expedition suitability depend on their gameplay rules |
| Trade | Find animals by species, quantity or identity in an offer | Define ownership transfer, eligibility and travel/transport effects |

The three-cattle Farmyard journey remains one specific benchmark. Later species need their own acquisition, assignment, care, transport and trade journeys once their rules exist. Shared batch controls should filter to eligible animals rather than silently assigning every animal to the same destination. Future features add contextual actions when available, without a row of permanent disabled controls.

## Other journey budgets

All current counts below are source-derived estimates, rather than observed playtest baselines. Start with no selection, the standard desktop controls available, visible subjects, sufficient resources and valid choices. Opening and choosing a dropdown option are separate clicks. Record scrolling, camera work, text entry and waiting separately.

| Journey | Current physical clicks | Proposed budget | Completion condition |
| --- | ---: | ---: | --- |
| Assign three unbound cattle to an active Farmyard | 12 | At most 3 | Farmyard selection, grouped assignment, review/commit; all three identities assigned |
| Give a known eligible resident a food-producing occupation | 4 | At most 3 | The chosen occupation is applied and its conditions are visible |
| Move a household to an available existing home | 4 | At most 3 | The household's residence changes and consequential Farmyard effects are explicit |
| Create and dispatch a three-person exploration group | 13, plus 1 if paused | At most 8, plus 1 if paused | A valid destination is assigned; travel progresses when the clock runs |
| Find a specific person in Family Tree | 4 | At most 3 | The requested identity and family relationships are displayed |
| Read a selected resident's first personal-history page | 2 from no selection | At most 2 | The actual recorded events are displayed |
| Read a published passage linked from that first history page | 3 from no selection | At most 3 | The referenced passage opens in Clan Book |

The 13-click expedition route starts with the already visible Create exploration group control and one group, so adding each member uses the default group without changing its dropdown. It includes clearing the resident selection and expanding the group. Entering through Menu and Expedition groups adds two clicks.

The proposed eight-click expedition route is Expeditions, Create group, three directly displayed member selections, confirm Start Expedition, Explore Area, then the destination. Start retains explicit preparation costs. Destination changes do not buy Food again. Prepared, travelling, returning and stranded states must remain distinct. Suitable member suggestions may shorten the route; eight remains its three-individual-selection budget.

Food shortage diagnosis is a separate journey from assigning a known person. The current header has no direct diagnostic route, so it has no justified fixed baseline. A Food explanation should link recorded stock changes and current constraints to possible actions without promising an unsupported forecast.

## Iconography and graphic direction

Use a coherent pictogram family with consistent weight and silhouette. Keep short English labels beside resource counters and primary actions. Tooltips and keyboard names explain icons; core meaning cannot depend on hover.

| Concept | Graphic treatment | Meaning to preserve |
| --- | --- | --- |
| Food | Bowl or food bundle | The actual combined Food stock |
| Materials | Construction-material bundle | The actual combined Materials stock |
| Residents | Person silhouettes | People currently resident, with presence/history explained in drilldown |
| Livestock | Recognisable herd symbol; species icon and label in the drilldown | A category containing actual animal records; cattle is one species |
| Home | Roof or house | Physical residence |
| Occupation | Role symbol beside the resident's work label | A person's job |
| Farmyard | Home with cattle/context badge | Active household farming function |
| Expedition | Route/compass symbol | Group and mission state |
| Clan Book | Book symbol | Recorded lore and family history |
| Attention | Symbol plus severity text | Actionable information; colour supplements the meaning |

Derive appearance from the supplied reference and existing Fjordside identity: compact charcoal surfaces, warm ivory text, restrained brass selection accents and small Nordic graphic details. Keep imagery decorative at panel edges so typography and icons remain legible. Keep controls within the existing TypeScript/CSS presentation stack without adding a UI framework.

Residents should have recognisable names and occupation imagery. Character portraits can use suitable existing assets or a later measured capture path. Health, Mood, Experience and social-cohesion meters require actual defined data; the reference image alone does not justify adding them.

New-story availability belongs in the attention system. Opening a chapter should be a player action rather than taking focus from an unfinished task.

## Future gameplay placement

| Future capability | UI home | Existing domain boundary |
| --- | --- | --- |
| Gatherings, wedding celebrations and remembrance | Community section within Settlement and contextual occasion links | Relationships, births and deaths remain autonomous; sponsorship supports an actual occasion |
| Apprentices hired for an occupation | Resident occupation detail and a mentor/candidate task | Distinguish future direct mentorship from the current parental-experience apprenticeship bonus |
| Longships, horses and wagons used for expeditions | Expedition preparation and asset details | Show actual suitability, occupancy, load and effects only when gameplay defines them |
| Trade and relations with other clans | Known-clan context and a trade task | Show actual counterparties, offers, goods and livestock identities; respect available knowledge |

These are extension points, not permanent disabled buttons. Exact event costs, cohesion representation, mentorship rules, vehicle capacity and trade negotiation remain governed by their gameplay issues. In particular, [the cultural-life northstar](gameplay/spec/10-CULTURAL-LIFE-COHESION.md) does not mandate a generic happiness bar, a festival chore or player permission for ordinary life events.

## Acceptance for the design comparison

At a 1440 by 900 CSS-pixel desktop viewport, propose at least 85 percent unobstructed world area while observing, 70 percent with a compact selection and 65 percent during a standard management task. Measure the union of UI panel/control rectangles, counting translucent panels as occupied. These are proposed layout targets. Validate legibility and access separately at 1280 by 720 and 1920 by 1080.

For each prototype and later implementation:

- Measure complete journeys from their declared starting state. Count opening controls, choosing options, target selection, mandatory confirmations and recovery after errors. Test keyboard operation separately rather than treating shortcuts as pointer-click savings.
- Use the same world seed, camera, season, simulation state and viewport for comparisons. Include founding, developed settlement, winter, unavailable resources, an away resident and an occupied/overcrowded Farmyard.
- Record completion, click count, search time, wrong turns, world area covered and whether the player understood costs and results. An automatic suggestion is successful only when it is understood and correct.
- Opening UI, inspecting and cancelling drafts must preserve canonical state, randomness and clock intent. Executed tasks must match the existing authorized commands, costs and consequences.
- Building ordinary housing preserves each resident's occupation and career settings, building specialization and animal assignments. Include mixed-occupation households and smith/fisher/hunter choices, plus the existing-farmer housing case; do not validate only Farmyards.
- Repeated events must not steal focus, erase drafts or charge a command twice. Feedback must remain readable after a panel collapses.
- Compare UI CPU time, layout work and frame-time distributions on matched active runs. Preserve cached campaign reads, bounded event/list views and stable focus. Do not add per-frame full-history scans or additional scene rendering passes.
- Treat unavailable projected data as unavailable; do not display an invented zero, forecast or benefit.

## Prototype comparison after design review

Compare three structurally different layouts using the same journeys and proposed interactions:

1. A compact right inspector with an integrated task review.
2. A bottom task tray with side-by-side resident/asset choices.
3. A compact contextual summary with a temporary focused task surface.

Use the same real-world scene and inspectable data for all three. Proposed actions use a local draft or stub rather than mutating a real campaign. Keep those variants separate from production implementation. The existing local prototype files predate these decisions and are not the approved design or new acceptance evidence.

## Implementation references

- [FjordHeader.ts](../src/fjord-play/FjordHeader.ts): calendar, current counters, clock and menu.
- [FjordPlay.ts](../src/fjord-play/FjordPlay.ts): selection, management ownership, notices, cached projections and camera integration.
- [SettlementPanel.ts](../src/play/SettlementPanel.ts): existing occupation, residence, specialization and livestock actions.
- [ExpeditionPanel.ts](../src/fjord-play/ExpeditionPanel.ts): group membership, start confirmation and target selection.
- [PersonalHistoryView.ts](../src/lore/PersonalHistoryView.ts) and [ClanBookReader.ts](../src/lore/ClanBookReader.ts): factual history and linked passages.
- [Farmyards.ts](../src/simulation/Farmyards.ts): current Farmyard semantics.
- [Game identity](FJORDSIDE-GAME-IDENTITY-V1.md), [branding](FJORDSIDE-BRANDING.md) and [visual foundations](FJORDSIDE-VISUAL-FOUNDATIONS-V01.md): existing identity and implementation context.
