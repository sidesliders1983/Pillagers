# Cultural Events prototype: gatherings and weather resilience

Status: experimental implementation for #275 + #276 under epic #274, extended by #277 below. On 26 October 2026,
the owner approved the public test boundaries and the values below as **experimental values**.
They are not approval for ordinary default-on campaigns. Culture is absent from legacy saves
and ordinary new Core campaigns unless explicitly enabled at campaign creation.

## One optional, atomic gathering

The first occasion is `storytelling_music`. `gatheringOffer` returns the current finite Food
quote and a deterministic set of 3–8 living, present adults. Active childcare providers,
expedition members and children are excluded using the existing availability authorities.
A single canonical pass derives childcare-provider IDs; the offer does not scan the event
ledger or enumerate resident pairs. Existing occupations and production remain unchanged:
no additional labour cost has been approved.

`SponsorGathering` includes the expected sequence, quoted Food and sorted expected participant
IDs. Core rechecks all three, current eligibility, stock and support capacity atomically.
A stale roster is rejected rather than silently replaced. Cancelling a UI quote sends no
command. Rejection never spends Food or creates an event. A matching retry of an accepted
request is a no-op, including after save/reload, later stock/time changes or a full bank;
a conflicting retry is rejected.

| Experimental rule | Value |
| --- | --- |
| Upfront gathering cost | 3 Food, no Materials |
| Minimum available participants | 3 adults |
| Maximum recorded participants | 8 adults |
| Contribution per accepted gathering | 1 prepared weather-support assessment |
| Maximum bank | 2 assessments |
| Strength per qualifying assessment | 25% reduction of weather-exposure risk only |
| Stacking | More prepared assessments do not increase strength |
| Expiry | None from real time, absence or ordinary simulation time |
| Consumption | One assessment for the entire qualifying settlement evaluation |

A full bank rejects another sponsorship before spending. No automatic gathering, annual fee,
missed-festival penalty, Food generation, new faith resource or generic happiness meter exists.
Campfire lighting remains its independent existing Material/fuel command. Sponsorship neither
lights the fire nor pays its fuel secretly.

## Actual weather consequence

The existing annual settlement mortality resolver remains authoritative. It resolves the
outgoing saved Winter weather before choosing the incoming Winter. Only a Harsh/Severe
assessment with a present exposed resident whose **final clamped risk actually decreases**
consumes prepared support. Permanent shelter, absence, Mild/Normal weather, zero rounded
reduction and fully clamped risks preserve the bank.

For each affected resident:

- Preserve the existing natural age-band mortality risk.
- Reduce only weather exposure by `floor(exposureBps * 2500 / 10000)`.
- Add the reduced exposure to the unchanged natural risk, retaining the existing 10,000-bps cap.
- Make the same single existing mortality roll, in the same resident order.

Default Harsh exposure changes from 50 to **38 bps**; Severe from 200 to **150 bps**.
For a resident with 5-bps natural risk, Severe total risk is therefore 205 → **155 bps**,
not a 25% reduction of their whole mortality risk. Prepared support does not change weather
probabilities/draws, cattle, expedition casualties, natural ageing, shelter or production.
Expedition-return mortality cannot consume settlement support.

## Canonical state and factual history

The optional version-1 `culture` state stores the saved configuration, next gathering sequence,
at most two source-event IDs and the latest gathering event ID. The existing semantic event
ledger is the cultural ledger; there is no duplicate unbounded receipt collection.

`CulturalGatheringHeld` freezes actual participant IDs/names/ages, canonical time, paid Food,
occasion, clan, request sequence and before/after support. `CultureWeatherSupportApplied`
records one aggregate risk assessment with its actual source event, affected resident facts,
outgoing weather and baseline/modified risk inputs. It does **not** claim that a death was
averted or invent a rescue, motive, belief or dialogue. Restoring validates the compact bank
against those committed receipts and rejects invented sources, requests or risk facts.

CPU clans have independent empty cultural state only in explicitly enabled new campaigns.
They receive no free gathering, Food or support. An actual accepted Core sponsorship is
required to earn an equivalent CPU benefit. Loading never initializes missing cultural state;
rollback restores the earlier canonical ledger and bank.

## Evidence and remaining calibration

Public Core/save tests cover the real paid transaction, retry/reload, invalid quotes, care and
actual expedition restrictions, finite FIFO assessments, permanent shelter, fully clamped risk,
CPU isolation, legacy parity and split/batch/rollback determinism. A real seed-1 controlled
Severe example changes founder-7's first-Winter outcome while retaining the 5-bps natural
component and paying the 3 Food. This is a regression example, **not proof of general value**.

Matched affordability and outcome cohorts, low-noise presentation, actual device performance
and owner playtesting remain separate evidence. Three Food is 20% of the initial fifteen;
a small absolute mortality-risk change may not justify its economic opportunity cost.
No simulation result establishes that the cultural choice is enjoyable.

Weather uses the existing mechanics RNG. Sponsoring consumes no RNG. After an altered death
changes later births/partnership draws, full multi-year weather trajectories can legitimately
diverge. Controlled one-Winter fixtures can isolate the risk mapping; multi-year reports must
record actual weather and describe paired complete strategies without claiming identical
realized weather after divergence.

Reproduce the focused checks:

```text
node --test tests/cultural-events.test.mjs tests/weather.test.mjs tests/personality-life-events.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

No formatter is configured. Touched source formatting is reviewed manually with `git diff --check`.
The original #275/#276 transaction did not implement the occasion variants described below.
Factual assistance after collapse (#278) and prerequisite-gated defence/newcomer integrations
(#279/#280) remain separate slices. They are not implemented by gathering animations/audio.

## Current 3D prototype

Explicit new Fjord campaigns opened with `?culture=1` expose the campfire sponsorship.
Existing or imported saves keep their stored rules. The compact in-card review shows
actual cost and people; Not now, Escape and closing the card leave resources unchanged.

The renderer stages up to six existing residents on Low or eight on Standard, using
safe ordinary walking. At least three must actually arrive before a short performance;
its optional approach is bounded at two active minutes. Attendees can take over a minute
to walk from their existing positions. At completion they follow a retained validated
corridor back before resuming legitimate presentation activities. Canonical attendance,
Food and prepared support never depend on this optional staging.

The motion bank is lazy, shared and animation-only. One group murmur and applause use
the existing audio owner, require sound consent and have a 2 MiB actual decoded-family cap.
The existing campfire fuel, light and warming remain their independent controls.
Pause/background/graphics interruption invalidates pending motion and pauses world audio
synchronously. Loaded history never starts a performance. The owner accepted the first
storytelling prototype's device/listening flow. New #277 occasions still need their own
rendered browser/device review; [measured headless costs](../qa/cultural-events/presentation-headless-report.md)
retain the remaining p95 and startup/tail limits rather than claiming device performance.


## #277 — wedding celebrations and communal ceremonies

The owner selected the wedding policy on 26 October 2026: **only a newly formed partnership
can be celebrated, within one game year of its actual canonical formation**. Existing founding
couples are excluded; FoundingPartnershipPresent records presence at arrival, not a formation
date that the game may invent later.

The shared occasion types are storytelling_music, communal_ceremony and wedding. All three
use the same optional SponsorGathering transaction, 3-Food quote, 3–8 available adults, two-
assessment bank, 25% exposure-only benefit and legacy/default policy described above. A full
bank rejects sponsorship before spending. A separate wedding or ceremony bonus does not exist.
The neutral Communal Ceremony name establishes no specific gods, practices, priesthood,
religious affiliation or belief; it grants no weather reroll, fertility or raid modifier.

### Wedding eligibility and the exact window

A wedding must cite a real earlier PartnershipFormed event. Its two actual people must still
be living reciprocal partners in the clan and both must satisfy the shared cultural eligibility
rules. Active care and expedition commitments are not overridden. Both partners reserve places
before the remaining slots are filled; final recorded participants remain sorted by immutable ID.
They are never replaced by other residents to make an unavailable couple appear to attend.

The celebration interval is [formation tick, formation tick + 1000), using canonical game time.
Elapsed ticks 0 and 999 qualify; 1000 does not. Real-world absence does not advance it. The
window limits the optional celebration, not the partnership. Declining or missing it does not
cancel a relationship, change household assignments or prevent normal family life.

Only the current genuine partnership source is offered; a later newly committed partnership
cannot reuse an older source for the same pair. Each source can be celebrated once. The
candidate projection may retain a still-current, in-window but temporarily unavailable or
already celebrated couple with an explicit disabled reason. Founding, expired, deceased or
ended partnerships are not listed as current candidates.

### Source facts and replay

The wedding command adds sourceEventId to the existing quote fields. The caller never supplies
authoritative spouses: Core derives them from the actual source. CulturalGatheringHeld freezes
sourceEventId and spouseIds alongside the normal real participant snapshots, cost and canonical
time. It creates no new PartnershipFormed event and does not redate the source, purchase a
partner, alter fertility, move a household or create children. Communal and storytelling commands
have no partnership source.

The existing version-1 cultural schema and event ledger remain shared. No persisted wedding
window, second receipt table or all-pairs relationship graph is added. Candidate/history source
indices are derived in one pass rather than searching history for every couple. The public
availableCulturalParticipants projection is shared with presentation, which may further restrict
physical visibility but cannot invent canonical eligibility or attendance.

Restore validation requires the earlier real formation source, matching spouses and attendance,
the one-year event-time window and one celebration per source. It deliberately does not require
the partners to remain together now: later death, departure or a new relationship must not
invalidate an earlier factual wedding. Matching accepted request retries remain no-ops even
after the window or current partnership has ended; conflicting occasion/source payloads reject.
Published historical chapters are not rewritten.

Public Core tests exercise actual new partnerships, the capped spouse roster, founding/window
exclusions, care/expedition absence, genuine later expedition loss, immutable prior family facts,
source integrity, CPU isolation, and common weather-support replay across save/load and split
ticks. Controlled fixtures use existing saved rules; they do not establish population-level
balance, historical ritual authenticity, animation quality or gameplay enjoyment.

Focused reproduction:

    node --test tests/cultural-occasions.test.mjs tests/cultural-events.test.mjs
    node node_modules/typescript/bin/tsc --noEmit

Wedding presentation reserves both actual partners before the Low six-actor cap. Both must
actually arrive, with at least one guest, before it starts. Missing/unavailable/dropped partners
or the existing two-minute approach limit safely end decoration without changing the accepted
Core event, costs or support. Existing actors return through the same validated routes.

Chronicle and Personal History distinguish celebrated partners, wedding guests and communal
ceremony participants. The Clan Book retains the exact real partnership callback, accounts
for paid Food in its ledger and preserves already published chapters across full campaign
restore. Presentation changes neither the Family Tree nor the canonical partnership date.
