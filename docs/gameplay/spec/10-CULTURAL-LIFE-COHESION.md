# 10 — Cultural Life & Social Cohesion

**Status:** Canonical gameplay northstar, approved by the owner on 2026-10-10. Future gameplay layer, not an implementation or balance change.

Parent principle: [GP-005](../../../GAME-PRINCIPLES.md#gp-005--autonomous-cultural-life-cohesion-strengthens-collective-resilience). Related: CORE-002/004, PLAYER-006/007/008, GP-002 and the existing family, defence and weather systems.

> **The clan lives autonomously. The player can invest resources in shared cultural moments to strengthen social cohesion. That cohesion helps residents defend their settlement, endure harsh weather, recover from loss, pass on their skills and support newcomer integration. Better coordination during raids is a possible further application to evaluate.**

The intended trade-off is **reserves now, productive infrastructure, or collective resilience**. Cultural life is not merely decoration and is not another route to an unconditional production bonus.

The owner's follow-up prioritises recovery and craftsmanship, supports integration/acceptance including captives, and opens raid success as a candidate for later calibration. These directions are recorded in CULTURE-006 through CULTURE-009; no numeric effect is enabled. The already established caregiver-proxy system is not a new cohesion mechanic.

## CULTURE-001 — Autonomous life, optional support
**Status:** Canonical northstar

> **As a player, I want my community to form relationships and experience life events without my permission, while I choose which occasions to support, so that residents remain people rather than units waiting for a button press.**

Rules:
- Preserve autonomous partnership/family/lifecycle rules and the player's existing management authority. Cultural sponsorship does not force a partnership, birth or death.
- A partnership and its wedding celebration are distinct. A couple can live together without a purchased feast; an existing founding partnership is not dated anew when celebrated later.
- Death and its canonical consequences do not wait for a funeral command. Normal community life and basic remembrance must not become mandatory micromanagement.
- The player may choose to invest resources in the timing, scale and organisation of a shared occasion. Exact actions and eligibility remain to be designed.
- Not sponsoring an optional gathering means foregoing that optional benefit, not a missed-festival penalty or automatic relationship failure.
- No offline progression, event expiry or cohesion decay caused by real-world absence. Any future simulation-time persistence rule must respect PLAYER-007 and avoid a recurring maintenance chore.
- Preserve the existing caregiver-proxy mechanic and its eligibility, labour cost and player commands. Do not introduce a second care system or make current proxy care conditional on cohesion or sponsored events.

Future acceptance:
- A campaign can continue its autonomous social life without sponsored events.
- Declining a celebration does not cancel an established partnership, prevent normal births or defer death cleanup.
- Existing caregiver-proxy behaviour remains available with or without cultural investment.

## CULTURE-002 — One cultural-event family
**Status:** Canonical direction; exact ceremony rules and historical forms remain open

| Occasion | Intended role | Boundary |
| --- | --- | --- |
| Wedding celebration | Mark an existing partnership and bring households/community together | Does not buy love or gate family formation |
| Community storytelling / music gathering | Share time and the community's actual history | No invented deeds, witnesses, dialogue or knowledge resource |
| Religious ceremony | A shared ritual that can strengthen solidarity | No automatic divine intervention, rerolled weather or guaranteed victory |
| Funeral / remembrance, if adopted | Mark an actual death and retain personal/community memory | Basic death resolution is autonomous; larger memorials are optional |

Use a shared future event structure: real occasion, eligible participants, location, resource commitment, resolution and factual history. These are not four independent minigames. Funeral mechanics, graves/monuments, ritual names/dates, audio and dedicated animation sets are not mandated by this northstar.

A storytelling/music gathering is the suggested first later slice to prove the common structure, not a scheduled implementation. Historical naming or religious detail requires its own source/design decision rather than invented claims.

## CULTURE-003 — Cohesion is collective resilience
**Status:** Canonical northstar; representation and formula remain open

> **As a player, I want cultural investment to strengthen residents' willingness to support each other, so that the settlement's social bonds matter when its security or survival is threatened.**

Social cohesion means collective solidarity, attachment and mutual support. It is a community gameplay concept, not a new CharacterDNA gene, hereditary aptitude, ethnic/heritage score, spendable Knowledge resource or generic happiness simulation. Whether it is represented by one score, bands, time-limited effects or another small state model is deliberately undecided.

### Primary benefit: settlement defence
- Higher cohesion should positively modify collective defensive resilience: residents stand by one another when their own settlement is threatened.
- Keep the outcome bounded and dependent on the actual defenders and other approved defence rules. Cohesion must not summon extra fighters, make children automatic combatants, guarantee victory or erase losses.
- Exact integration with resistance, resolve or casualty calculations is open; this document introduces no separate morale/combat subsystem.
- Settlement defence remains the primary combat application. The owner has subsequently opened a bounded raid-success benefit through coordination for investigation (CULTURE-009); it is not yet an adopted formula or a general recon/pillage buff.

### Primary benefit: enduring harsh conditions
- Higher cohesion should positively modify the community's ability to withstand adverse weather through mutual support and coordinated coping.
- Apply any later modifier to explicitly chosen consequence/resilience calculations, not to the weather draw itself. No additional or duplicate weather roll.
- Cohesion does not create Food, remove the need for shelter/reserves or guarantee survival. Preserve the strategic value of preparation and the actual saved weather rules.
- Exact affected outcomes, recipients and modifier strengths remain open. Do not automatically extend a human-cohesion benefit to cattle or all economic systems.

Additional supported directions are recovery, mentorship and integration, with boundaries below. Cohesion is primarily a positive advantage over a functioning baseline, not a punishment system for not hosting parties.

Future acceptance:
- Controlled comparisons demonstrate the chosen positive defence/weather-resilience effects without changing weather, available resources or the number of real participants.
- Cultural investment does not introduce a generic occupation-productivity multiplier.

## CULTURE-004 — Real costs, understandable choices, no upkeep treadmill
**Status:** Canonical direction; costs and balancing are open

> **As a player, I want to weigh spending on shared occasions against stores and buildings, so that investing in solidarity is meaningful rather than an automatic optimal click.**

Approved direction:
- Commit existing resources through explicit Simulation Commands. Food and possibly Materials are candidate costs; exact resources/amounts per occasion are not fixed here.
- State costs and intended benefits clearly. If participation later costs work time, that must be an explicit, separately balanced rule rather than a side effect of walking animations.
- Preserve useful saving and normal-Winter sustainability; do not consume the player's crisis reserve merely to avoid a social penalty.
- Gains must be bounded: repeated cheap events cannot stack into invulnerability or an unlimited bonus. Caps, cooldowns and diminishing gains are open implementation choices, not fixed numbers.
- Do not add a mandatory event each Winter, individual entertainment needs, a faith economy or a festival-maintenance bar.

Future balancing should compare no sponsored events, modest cultural investment and heavy investment using matched campaigns. Measure resources spent, defensive/weather consequences, unmet consumption and retained agency separately. A smaller Food stock alone is not proof of better gameplay.

## CULTURE-005 — Core events first; animation and Lore follow
**Status:** Canonical architecture boundary

> **As a game system, I need cultural events and cohesion effects to resolve headlessly from canonical state, so that presentation quality or generated prose never determines the community's resilience.**

Rules:
- The eventual Simulation Core owns event eligibility, actual participants/costs, completion and approved cohesion effects. Persist/version its state and use deterministic canonical randomness only where required.
- Ambient encounters from #95 remain visual only. Two residents standing together, a campfire effect from #97 or music playback cannot silently award cohesion.
- Present the same event through Gameplay Lab, 2D or Fjord. Paths, asset loading, missing animations and frame rate do not determine whether it succeeds.
- Respect canonical absence, childcare, indoor visibility and participation constraints. An event is not permission to show every resident outdoors or teleport expedition members home. Specific attendance exceptions require a later decision.
- Record immutable semantic events with IDs, game time, actual participants, costs, approved outcomes and links to the underlying partnership/death/history where applicable. Displayed witnesses, motives or dialogue require recorded facts.
- GP-002 remains unchanged: AI/Lore narrates real events; it never generates cohesion, alters their outcomes or invents supernatural/weather effects. A storytelling gathering can reference prior factual event IDs without modifying that history.
- Save/load, repeated callbacks and view switching must not charge twice, award a benefit twice or replay a historical gathering as a new one.

Future acceptance:
- Identical state/seed/commands resolve identically with the renderer and Lore enabled or disabled.
- Resource conservation includes actual event costs; outcome/event IDs prevent duplicate charges or rewards.
- Ordinary ambient movement and VFX leave cohesion and canonical history unchanged.

## CULTURE-006 — Recovery after loss
**Status:** Approved additional northstar direction; mechanisms and balance remain open

> **As a player, I want a cohesive community to help disrupted households recover, so that losing a home or suffering an attack does not automatically cause prolonged settlement-wide disruption.**

Direction and boundaries:
- Distinguish preventing damage through defence from coping with its aftermath. Cohesion can support temporary accommodation and collective recovery after actual loss.
- Temporary hospitality is a candidate mechanism, not permission to fit unlimited residents in a small house. Available space, eligible hosts, duration and consequences require explicit rules.
- Assistance uses real residents and available Materials. It does not rebuild free houses, undo deaths or restore destroyed assets from nothing.
- If repair or construction duration is introduced later, communal labour may help recovery while costing other work. Do not apply a fictitious speed bonus to an instantaneous building command or add a new construction system solely for cohesion.
- These are situational recovery benefits, not permanent upkeep discounts or another caregiver-proxy mechanic.

Future acceptance:
- A controlled loss scenario can demonstrate reduced disruption with identifiable hosts/helpers and conserved resources once a concrete recovery rule is approved.

## CULTURE-007 — Mentorship and continuity of craftsmanship
**Status:** Approved additional northstar direction; learning mechanics and balance remain open

> **As a player, I want experienced residents to pass craftsmanship beyond their own family, so that expertise can survive retirement from work, death or generational turnover.**

Direction and boundaries:
- Cohesion can support mentorship and sharing experience across households, not only along parent-child links. Mentors and learners are real Personas with their own occupation histories.
- DNA determines innate aptitude; experience belongs to a person; cohesion helps people pass on skills. Mentorship never rewrites CharacterDNA or creates a separate Knowledge resource.
- Inspect and reuse existing experience/apprenticeship mechanisms before adding anything. Better mentor matching, bounded guided learning or a limited transition benefit are candidate mechanisms, not cumulative approved bonuses.
- Require an actual experienced and available mentor. Mentoring capacity, duration and any labour opportunity cost must be explicit before implementation; no unlimited teaching by deceased or absent residents.
- Poor innate fit is not erased. No automatic permanent productivity multiplier is granted to every resident because clan cohesion is high.

Future acceptance:
- A non-related learner can benefit from a real mentor under an approved rule, with unchanged DNA and traceable learning history. Measure downstream Food/Materials and succession effects rather than assuming economic neutrality.

## CULTURE-008 — Acceptance and integration of newcomers, including captives
**Status:** Supported additional northstar direction; representation and integration rules remain open

> **As a player, I want cultural investment to help newcomers find a place in the community, including people brought back from pillaging, so that acquiring a person is not automatically the same as forming a lasting social bond.**

Direction and boundaries:
- Community acceptance and the newcomer's own attachment are distinct concepts. Do not mandate two new meters, but do not infer both from one high clan score.
- Cohesion may help access to household/community connections and mentors. Time, treatment and actual participation are candidate inputs to a later integration rule; exact phases, thresholds and effects are undecided.
- Captives retain their identity, origin, lineage, DNA and experience. Capture does not establish loyalty; a celebration cannot instantly erase their history or guarantee allegiance.
- This is an explicit gameplay direction for inclusion, not a claim that every cohesive group automatically welcomes outsiders. Do not derive acceptance from heritage, ethnicity or an invented cultural/genetic compatibility score.
- No automatic romance, loss of existing expertise, rebellion, escape or loyalty system is introduced by this document. Any effects on work or expedition eligibility need their own design decision and save-compatible implementation.

Future acceptance:
- Future integration outcomes reference actual transferred/arriving people and preserve their histories; one cultural event cannot silently convert arrival into guaranteed loyalty.

## CULTURE-009 — Raid coordination as a candidate application
**Status:** Open candidate for investigation/calibration; not an adopted raid modifier

> **As a player, I may benefit from sending a well-coordinated group, so that their shared bonds can contribute to raid success without replacing individual capabilities or target resistance.**

The owner's follow-up allows exploring **higher raid success through cohesion**. This supersedes the earlier blanket exclusion of offensive applications only as permission to investigate; it does not select a formula, numerical bonus or production default.

Candidate boundaries:
- Start by evaluating one bounded positive success-chance modifier representing coordination, not inherently stronger individual fighters or guaranteed success.
- Keep actual group membership, capability, target resistance and existing mission costs relevant. Do not also grant extra loot, carrying slots, damage and casualty protection automatically.
- Decide whether and how community cohesion represents the dispatched group's bonds. In particular, a newly captured person must not automatically be assumed to share the established group's attachment; integration and any group-level representation remain open.
- No general recon bonus or separate rescue/evacuation system is approved by this candidate.

Before adoption:
- Compare matched raids with and without the candidate, reporting success, actual losses, resources/costs and group composition. Check for compounding raid-loot/feast/cohesion loops before setting any default.

## Open design decisions — not authorised defaults

Before implementation, separately decide the cohesion representation/baseline, how autonomous life contributes to it, persistence or simulation-time decay, bounds and stacking, costs/duration/attendance, cancellation/refunds, and exact defence/weather application. Recovery accommodation and labour, mentorship capacity/learning effects, newcomer acceptance/integration and the candidate raid modifier also require concrete design and calibration. The selected directions above do not authorise numeric defaults or a full relationship/religion simulator.

The first cultural-event slice may precede defensive gameplay, but must not fake a defence system simply to demonstrate a cohesion benefit. Any delivered subset and unavailable effects must be labelled clearly.

## Scope and sequence

This is a lasting product direction and a backlog layer, not an instruction to implement it immediately or expand current tasks. #89 (visual lifecycle/weather), #94–#96 (movement/interactions/stability) and #97 (VFX) retain their existing scope. Later cultural-event implementation can consume those visual systems while remaining independent of them.

Recovery and mentorship are the strongest next applications selected by the owner; newcomer/captive integration is a supported further layer. Raid coordination remains an optional investigation. None changes the existing caregiver-proxy contract or requires immediate implementation.

No present code, balance, saves, fertility, work, mortality, weather, raid rules or historical QA reports are changed by this documentation decision.
