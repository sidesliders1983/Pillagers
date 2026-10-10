# 10 — Cultural Life & Social Cohesion

**Status:** Canonical gameplay northstar, approved by the owner on 2026-10-10. Future gameplay layer, not an implementation or balance change.

Parent principle: [GP-005](../../../GAME-PRINCIPLES.md#gp-005--autonomous-cultural-life-cohesion-strengthens-collective-resilience). Related: CORE-002/004, PLAYER-006/007/008, GP-002 and the existing family, defence and weather systems.

> **The clan lives autonomously. The player can invest resources in shared cultural moments to strengthen social cohesion. That cohesion primarily helps residents stand by one another in defence of their settlement and through harsh weather.**

The intended trade-off is **reserves now, productive infrastructure, or collective resilience**. Cultural life is not merely decoration and is not another route to an unconditional production bonus.

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

Future acceptance:
- A campaign can continue its autonomous social life without sponsored events.
- Declining a celebration does not cancel an established partnership, prevent normal births or defer death cleanup.

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
- A general offensive raid, recon or pillage-success bonus is not approved by this decision. Settlement defence is the primary combat application.

### Primary benefit: enduring harsh conditions
- Higher cohesion should positively modify the community's ability to withstand adverse weather through mutual support and coordinated coping.
- Apply any later modifier to explicitly chosen consequence/resilience calculations, not to the weather draw itself. No additional or duplicate weather roll.
- Cohesion does not create Food, remove the need for shelter/reserves or guarantee survival. Preserve the strategic value of preparation and the actual saved weather rules.
- Exact affected outcomes, recipients and modifier strengths remain open. Do not automatically extend a human-cohesion benefit to cattle or all economic systems.

Other resilience applications may be proposed later, but are not implied implementation requirements. Cohesion is primarily a positive advantage over a functioning baseline, not a punishment system for not hosting parties.

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

## Open design decisions — not authorised defaults

Before implementation, separately decide the cohesion representation/baseline, how autonomous life contributes to it, persistence or simulation-time decay, bounds and stacking, costs/duration/attendance, cancellation/refunds, and exact defence/weather application. Effects on recovery, future newcomers or other systems are not specified here. Do not silently choose numeric values or expand culture into a full relationship/religion simulator.

The first cultural-event slice may precede defensive gameplay, but must not fake a defence system simply to demonstrate a cohesion benefit. Any delivered subset and unavailable effects must be labelled clearly.

## Scope and sequence

This is a lasting product direction and a backlog layer, not an instruction to implement it immediately or expand current tasks. #89 (visual lifecycle/weather), #94–#96 (movement/interactions/stability) and #97 (VFX) retain their existing scope. Later cultural-event implementation can consume those visual systems while remaining independent of them.

No present code, balance, saves, fertility, work, mortality, weather, raid rules or historical QA reports are changed by this documentation decision.
