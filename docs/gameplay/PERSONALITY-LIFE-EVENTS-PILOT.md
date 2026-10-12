# Personality Life Events v0.1 · player campaign rollout

Issue [#120](https://github.com/sidesliders1983/Pillagers/issues/120), following the [#121 northstar](https://github.com/sidesliders1983/Pillagers/pull/121). Approved public test boundaries: Simulation Core/save-load, paired measurement output, Gameplay Lab/Chronicle browser behavior. [Reuse map](PERSONALITY-LIFE-EVENTS-REUSE.md).

## Campaign scope

Owner decision, 12 October 2026: newly created player campaigns enable the existing social behavior by default through Gameplay Lab and the shared 2D/Fjord session. The low-level Core factory remains explicit-off for development/baseline comparisons and CPU neighbours. Gameplay Lab can explicitly opt a new campaign out. Loading/importing an existing or legacy save retains its recorded enabled/disabled behavior, including a missing social extension; it creates no retrospective events. Restart preserves saved social rules unless an explicit Lab setting overrides them for the restarted campaign. A genuinely new campaign uses the new default, independently of the last imported save. The experiment is saved and follows the campaign through 2D/3D handoff; readers/rendering never sample it. CPU neighbours remain ordinary unless a labelled QA fixture explicitly enables them.

No economic, production, care, fertility, mortality, combat, cohesion or family-tree-admission effects. DNA is not rewritten. No new model calls, motives, dialogue, animations or intervention controls.

## Opportunities and probabilities

An available participant is alive, in the active clan registry, at least the saved adult age (normally 18), not on expedition, and not currently providing care. Work age 16 does not establish social adulthood. An existing tie is reciprocal partnership, the existing close-kinship relation (parents/grandparents, siblings, aunt/uncle), or shared household membership. A helper must be a distinct available adult with one of those ties to a disputant. Neither sex nor heritage enters the formulas.

Evaluation happens once at each fully crossed annual boundary, after domestic reckoning and expedition returns/transfers. It takes the actual resident FoodConsumed event from that reckoning. A positive resident shortfall plus an existing tie creates a quarrel opportunity; a low stock alone does not. Later resolution needs an existing dispute, not a new shortage.

Let T be the two disputants' mean normalized Temperament, and H the helper's. All formulas return integer basis points, rounded to nearest point unless noted; 10,000 bps = 100%.

| Rule | Approved prototype |
| --- | --- |
| New quarrel | 500 + 2,500 × T bps (5–30%) |
| Helper initiative | 1,000 + 2,000 × H bps (10–30%) |
| Mediation success, separately rolled | 5,000 bps (50%) |
| Independent reconciliation | 1,000 + 1,000 × (1 − T) bps (10–20%) |
| Pair with recent reconciliation | floor(quarrel chance × 0.5) |
| Earliest resolution | Next annual boundary after opening |
| Failed mediation | Next attempt at failure year + 2; independent reconciliation may still occur in later windows |
| Reconciliation memory | From resolution to, but excluding, resolution year + 3 |
| Unresolved expiry | At opening year + 5, before another opportunity |

High Temperament can promote conflict and intervention; it is not a moral score or an unconditional penalty. A failed attempt remains unresolved and cannot independently reconcile in that same window. Successful mediation emits its attempt and one resolution for the same incident; it counts as one participation episode.

## Limits, fairness and continuation

At most one existing incident and one new candidate pair are evaluated per year. Disputants considered for resolution are excluded from the new candidate; a helper who actually attempts mediation is also excluded. Each resident participates in at most one actual episode per window. One open incident per unordered pair. No opening-year resolution or endless escalation.

Pairs use a saved, isolated version-1 seeded stream, a random starting point in the sorted pair sequence, a cyclic scan of at most 128 pairs, and reservoir selection among eligible pairs encountered. Existing incidents/helpers are selected using the same stream rather than always the smallest ID. This is bounded opportunity sampling, not a guarantee that every eligible pair in a very large population is assessed annually. Zero chance gives no event; uneventful years remain valid evidence.

Working state holds active incidents, finite reconciliation memory and the latest diagnostic window. Death or transfer closes a dispute as inactive immediately; expiry explicitly ends it unresolved. Temporary care/expedition commitments block participation without inventing reconciliation. Semantic history remains in the event ledger. Saves validate stream/config/scheduler, incident links, participants, opening/attempt/result continuity and working-state agreement with history. Rollback removes future social memory.

## Recorded meaning and presentation

ResidentQuarrelled references the exact FoodConsumed context and snapshots the participants. MediationAttempted distinguishes initiative from success and identifies the real helper. ResidentsReconciled closes that same incident independently or through the successful attempt. SocialIncidentEnded records inactive or expired-unresolved, never reconciliation. Events retain canonical time, event-time names/ages, incident and prior source links, config version and evaluated chances.

The Gameplay Lab has a readonly, stable diagnostic disclosure and existing Chronicle/Raw Events readers. Clan Book plan version 3 groups related social sources and preserves older plan versions 1/2 and published chapters. Text states recorded actions/outcomes only; it does not call people angry, kind, hungry or insulting. Food/Materials accounting remains in the factual overview.

## Evidence and limits

[QA report](../qa/personality-life-events/report.md): paired 100-seed × 25-year default domestic cohort, 100 separately labelled controlled shortage/kin/helper fixtures, plus four full-world checks. Enabled and disabled non-social outcomes are compared at every boundary, normalizing sequential event IDs independently per clan. Enabled replay is compared exactly across repeated, batched and saved/restored runs on verification seeds.

Timings are descriptive CPU wall times from this development laptop; no millisecond gate. Physical iPad behavior is not certified by desktop touch emulation. The settled family rules are two complete Winters of birth cooldown and five Winters of childcare. These are independent rules; five-Winter care is correct, not an inherited discrepancy. Saved-rule compatibility is preserved. Historical measurement reports are preserved.
