# 12 — Personality-driven Life Events

**Status: Canonical northstar, approved direction 2026-10-12; implementation and numerical balance pending.** This records the owner's request for probabilistic, personality-influenced quarrels, rebelliousness, help and other life events. The bounded pilot below is an experiment, not approval to implement every example or enable the system in ordinary campaigns.

Related: [GP-006](../../../GAME-PRINCIPLES.md#gp-006--personality-is-expressed-through-contextual-life-events), [Personas & Family / PERSON-004](02-PERSONAS-FAMILY.md), [Cultural Life & Social Cohesion](10-CULTURAL-LIFE-COHESION.md), [Lore](11-LORE-CLAN-BOOK.md). First test: [#120](https://github.com/sidesliders1983/Pillagers/issues/120). [#119](https://github.com/sidesliders1983/Pillagers/issues/119) remains a separate family-tree projection.

> Traits shape tendencies. Circumstances create opportunities. Relationships and earlier experiences influence the response. Simulation Core resolves what actually happens; the saga tells that history.

## LIFE-001 — Contextual probability, not arbitrary drama

**Status:** Canonical direction; event opportunities, rates and coefficients remain prototype choices.

**Story:** As a player, I want to recognize a resident through their reactions to circumstances, without every resident behaving identically or a trait prescribing their fate.

**Rules:**
- Resolve eligible situation → eligible participants → context/trait/history-weighted chance → action and actual consequence → recorded event. A seeded random draw is permitted; the owner rejects unconditioned uniform drama, not uncertainty itself.
- Supported triggers must be actual simulation facts. Examples for later design include scarcity, a recorded dispute, a concrete request, housing loss or a real task disagreement. Do not infer a personal grievance from an animation, generic weather label or a sentence the writer invented.
- Separate the chance to encounter an opportunity, willingness to act and chance of success. Record enough context to explain a probability without asserting an unmodeled motive or guaranteed outcome.
- No event is a normal outcome. Quiet years and people who do not quarrel are valid; there is no quota to manufacture a climax in each five-Winter chapter.
- All sampling follows explicit canonical intervals or unique committed triggers. Renderer frame rate, contact distance, year pacing, UI clicks and opening the book must not change the number of draws.

**Acceptance:** No eligible context/participants means no event. Fixed-context tests show the intended probability differences; split/batched time and save/resume yield the same outcomes.

## LIFE-002 — Reuse traits without moral labels

**Status:** Canonical semantic boundary; exact behavioral mappings remain to be tested.

**Story:** As a player, I want the traits already belonging to a resident to matter in their life, rather than a second random personality system replacing them.

**Rules:**
- Preserve CharacterDNA and PERSON-004. Do not add arbitrary troublemaker/helper/rebel types, re-roll personality, or silently add kindness, obedience or virtue to the genome.
- **Temperament:** calm/restrained through impulsive/fiery. Higher values may increase quick escalation, but can also increase prompt intervention when another needs help. It is not merely a penalty and does not guarantee courage, hostility, selflessness or success.
- **Cunning:** tactical/opportunistic approach, not automatic dishonesty, disloyalty or treason. **Intelligence:** analytical/technical approach, not goodness or guaranteed diplomacy. **Physicality/Agility:** capability where relevant, not willingness to help or moral character.
- Different events may use different subsets of traits; do not force all five into every formula. Use actual relationships, commitments and experiences for social context. No heritage or sex multiplier for conflict, trustworthiness or helpfulness.
- A displayed personality description, if later introduced, is a transparent summary of supported tendencies/behavior, not a new source of facts or a permanent moral verdict.

**Acceptance:** Identical traits can lead to different responses in different recorded contexts; a high trait is not a universal advantage or penalty. No unsupported trait, identity or morality inference enters the saga.

## LIFE-003 — Shared history influences later opportunities

**Status:** Canonical direction; state representation and lifetimes remain implementation design.

**Story:** As a player, I want a quarrel, help or reconciliation to matter to later interactions, so that episodes form recognizable histories instead of isolated notifications.

**Rules:**
- Maintain only the sparse incident/recent-history state needed for supported rules, linked to stable participant and source-event IDs. This is canonical social state, not a renderer cache or prose-derived relationship.
- Preserve initial DNA separately from lived experience. A remembered disagreement or help episode can influence later social probability without rewriting inherited traits.
- Use bounded cooldowns, per-person/per-pair participation limits and documented decay/expiry. No endless automatic conflict escalation or accumulating permanent penalties. Evict expired working state without erasing event history.
- Record attempts separately from success. Mediation that closes a real dispute is help; an offer alone is not successful aid. Expiry, departure and death are not mutual reconciliation.
- Death or absence invalidates pending participation but preserves the past. Save rollback restores the earlier history, not memories from an abandoned future. Never reuse romantic partner IDs as conversation/dispute state.

**Acceptance:** A prior episode changes a later valid opportunity through the documented rule; no duplicate active incident or stale participant, and no uncontrolled event/memory growth.

## LIFE-004 — Autonomy with understandable consequences

**Status:** Canonical boundaries; broader consequences and player interventions are future design.

**Story:** As a player, I want autonomous residents whose actions create understandable situations, rather than controls that fail unpredictably or a stream of compulsory decisions.

**Rules:**
- The first test changes only social incidents, their resolution and near-term social chances. It introduces no resource, production, fertility or combat modifier.
- Later help with recovery, accommodation, mentoring or integration must use those real mechanics, availability and costs. Do not narrate rebuilt houses, transferred materials or training that did not occur. The existing caregiver-proxy needs no duplicate system.
- Objection to a concrete decision is a possible next step. Work refusal requires explicit rules, a visible reason and understandable limits/options; never silently ignore an assignment command. Full revolt is a separate later escalation system, not a single unlucky high-temperament roll.
- GP-005 remains intact: cultural investment is voluntary and principally positive. Do not drain global cohesion for every argument and force the player to buy recurring feasts to repair it. Any cohesion-to-social-events modifier needs explicit later design/calibration.
- Ordinary social events do not each demand a modal or response. Preserve current management controls and the non-pausing saga reader.
- Social importance is not family significance. Aid, a quarrel or a raid achievement does not admit an unrelated outsider to #119; the approved founder/partnership/parentage rules remain authoritative.

**Acceptance:** Attempts, outcomes and consequences agree; the pilot cannot override work/care commands, grant free resources, force cultural spending or change tree inclusion.

## LIFE-005 — Core creates events; presentation and Lore consume them

**Status:** Canonical architecture and factuality boundary.

**Story:** As a player, I want the same resident history regardless of rendering, reading speed or an available language model.

**Rules:**
- Core owns selection, probability, results, state and persisted random continuation. This is new simulated behavior, not the presentation PRNG used by wandering or the narrative seed used by chapter wording.
- For the experiment, isolate social draws in a versioned, saved canonical substream without consuming the existing mechanics stream. Validate config, scheduler state, references and RNG on restore. Do not recreate a random stream on every load.
- Write semantic events after committing real outcomes, with stable IDs, canonical time, event-time participant names/ages, incident/context links and actual result. Numerical chance factors belong in traceable diagnostics. A model-selected adjective is not proof of a motive.
- Reuse the semantic ledger, identity/kinship/availability queries, saves and current Chronicle/Saga Book adapters. No separate game backend, generic AI-agent framework, model call or paid service is required.
- GP-002 still prohibits invented dialogue, witnesses, intention, causality and consequences. Recorded pressure may be context; only a specifically modeled causal reason authorizes causal wording. Unknown/incomplete events use controlled fallback or Raw Events.
- Existing Talk/Listen can later illustrate a committed interaction. Contact between moving models and animation completion must never generate/reroll the event or gate its completion. The first pilot requires no animation work.
- Preserve published chapters and provenance. Reading or changing presentation never triggers social sampling, rewrites chapters, pauses/resumes the world or bypasses no-offline rules.

**Acceptance:** Enabled social simulation is reproducible headlessly and with rendering/Lore toggled. Disabled/legacy behavior remains unchanged; new social state/events are an explicitly expected difference when enabled, not evidence of failed full-ledger parity.

## LIFE-006 — Small pilot and evidence before expansion

**Status:** Experimental delivery plan; not settled balance.

**Story:** As a developer/player, I want a small test of recognizable behavior before building a full social simulator.

[#120](https://github.com/sidesliders1983/Pillagers/issues/120) implements **quarrel → possible mediation/help → possible reconciliation**, using a real shortage context and known social ties as the first narrow trigger. One annual evaluation is a prototype cadence, not a rule that future events may happen only once per year. Coefficients, eligibility restrictions, cooldowns and budgets are recorded experimental settings.

Rollout decision 2026-10-12 supersedes the initial opt-in-only pilot: new player campaigns default on through the shared 2D/Fjord/Gameplay Lab session. Explicit-off development configuration remains supported; CPU neighbours stay disabled. Existing and legacy saves retain recorded rules, and restart preserves those rules. Loading never activates missing social state or rewrites history. Reuse Gameplay Lab/QA and the existing event reader. No independent life-sim UI or event-editor product. Test new semantic event mappings without making the family tree, text-model research or speech backlog wait for this experiment.

**Acceptance:**
- Public probability and state-transition tests isolate traits, pressure and history; check no-event, attempt/failure/success and cooldown/expiry cases.
- Seeded multi-year cohorts report eligible opportunities, per-person/pair incidence, aid/resolution and recurrence, not only a cherry-picked dramatic story. Starting proposal: 100 seeds × 25 Winters plus controlled public-Core fixtures; report actual configuration and uneventful runs.
- Fixed-context comparisons separate social probability from the existing effects of DNA on work/economy. A single resident's outcome is not statistical proof of a trait effect.
- Save/restore, old saves, availability changes, split/batched time, duplicate callbacks, renderer/reader independence and baseline isolation are verified without weakening existing checks.
- Deliver one source-linked readable episode and a keep/adjust/defer assessment of frequency, fairness, recognizability and cost before adding wider consequences; default-on new player playtesting is separately owner-approved.

## Open decisions and scope

Later event types, durable trust, intervention commands, refusal/revolt, material help, mentoring, integration and cohesion coupling require their own small decisions and tests. No new DNA traits, mandatory culture upkeep, simulated speech, generated motives, social injury/death, paid service, or portrait/animation pipeline is implied here. Numerical probabilities and mapping details are prototype hypotheses, not claims about real human psychology.

This document records approved product direction. It does not implement life events, alter current defaults or certify any benchmark. Preserve historical QA reports when future rules are added.
