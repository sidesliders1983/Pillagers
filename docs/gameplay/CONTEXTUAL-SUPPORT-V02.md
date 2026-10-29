# Contextual Support v0.2 — assistance after housing loss

Issue [#278](https://github.com/sidesliders1983/Pillagers/issues/278), within epic #274.
These experimental values were approved on 26 October 2026. This extends the existing
social pilot and [shared cultural weather support](CULTURAL-EVENTS-PROTOTYPE.md), without
changing housing, childcare, work or ordinary campaign defaults. #279/#280 are deferred.

## One actual loss, one bounded opportunity

Only a committed BuildingCollapsed event with actual displaced households and named
residents can open an episode. At most the first occupied loss per clan and canonical
year is reviewed, whether or not it produces an offer. Reloading, reading history or
emptying the support bank never reopens an old source.

The recipient must be an affected, living, available adult. The helper must be a different
available adult with an actual household, partnership or kinship tie. A co-displaced
partner/family member may help. Children, expedition members and active childcare
participants are excluded by the existing social availability contract. Participants
already used by the current annual social window are excluded. Candidate sampling uses
the existing cyclic bounded approach: a random start and at most 128 candidate pairs.
It does not promise exhaustive matching in a large population.

| Experimental rule | Value |
| --- | --- |
| Loss sources reviewed | At most one per clan/year |
| Offer chance with an eligible pair | 10% |
| Response time | Exactly 50 canonical ticks |
| Acceptance chance when both remain available and tied | 50% |
| Contribution after completed assistance | One existing prepared weather assessment if capacity permits |
| Shared maximum | Two assessments, including paid cultural gatherings |
| Food, Materials, repair or new housing | None |

The tiny saved version-1 state contains its configuration, isolated seeded RNG, sequence,
latest reviewed source/year and at most one pending offer. No all-pair relationship table,
second cohesion currency, compulsory player response or recurring upkeep is introduced.
The separate stream leaves mechanics/weather and existing social random streams intact.

## Facts and consequence

SupportOffered freezes source loss, household, actual helper/recipient, event-time names,
ages and due tick. It awards nothing. At the due tick, unavailable parties or a lost tie
produce SupportEnded; a failed acceptance roll produces SupportDeclined. An accepted
episode records SupportAccepted followed by SupportCompleted. Death or transfer cannot
turn a pending offer into completed assistance. A temporary absence at resolution ends
the episode; it does not wait indefinitely.

Only SupportCompleted can append its actual event ID to the existing Culture FIFO.
If the shared bank is already full, completion records zero contribution. Existing paid
gathering sequences and receipts remain unchanged. One later qualifying exposed-resident
Harsh/Severe assessment consumes one contribution and reduces only its weather-exposure
component by 25%; normal age mortality, weather selection, animals and production remain
unchanged. Stacking changes the number of usable assessments, never their strength.

This is factual social assistance with a future-resilience contribution. It does not
claim that a house was repaired, someone received supplies or a death was prevented.
Chronicle, Personal History and Clan Book preserve the real source chain. Only completed
assistance creates one existing Activity Center life item, linked to the recipient; offers,
acceptance, declines and ended episodes create no additional modal or inbox. Optional
movement or dialogue is not required to resolve the episode and grants no reward.

## Campaign compatibility and validation

The contextual-help pilot requires enabled Culture and social life and is explicitly
opted in with ?culture=1 in Fjord. Cultural ceremonies themselves became ordinary Fjord
features after owner approval on 29 October 2026; that rollout does not automatically
enable contextual help. Older saves without contextualSupport stay
without it on load and founder replay. Explicit disabled QA campaigns also remain disabled.
No historical save or frozen chapter is upgraded by inventing a past offer. CPU clans
require their own enabled social/cultural state and actual loss; initialization grants
no contribution or extra resources.

Public reconstruction verifies the actual maintenance/collapse source, unique review,
participant identity and historical tie, offer/result continuity, due tick, pending state
and shared-bank receipts. Save/load, rollback and batched/split ticks preserve the ledger.
The controller reads only newly emitted tick events; it does not rescan history per tick.

## Evidence and limits

The focused public tests cover real construction/collapse, unavailable or absent helpers,
childbirth/care, death, actual captive transfer, failed response, shared FIFO/full capacity,
source tampering, legacy sessions and exact persistence. A separately labelled controlled
Severe assessment demonstrates the real exposure mapping from 200 to 150 bps with a
completed-assistance source; it is not a claim about normal weather frequency.

[The #278 QA evidence](../qa/contextual-support-278/) records the frozen normal-probability
32-campaign ten-year matched cohort and a separately identified physical Fjord replay.
No enlarged search, free resources or forced success is used to make ordinary results
favourable. Historical runner/source failures remain identified separately. A rare
completed episode proves the loop can operate, not that its balance or experience is fun.

Reproduce the public checks:

```text
node --test tests/contextual-support.test.mjs tests/contextual-support-history.test.mjs tests/contextual-support-session.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```
