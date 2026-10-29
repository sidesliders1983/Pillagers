# Cultural Events prototype: gatherings and weather resilience

Status: experimental implementation for #275 + #276 under epic #274, extended by #277 below and [contextual support #278](CONTEXTUAL-SUPPORT-V02.md). On 26 October 2026,
the owner approved the public test boundaries and the values below as **experimental values**.
On 29 October 2026, after Sites playtesting, the owner approved making these occasions
available in ordinary new and existing Fjord campaigns. The approved costs and weather
contributions below are unchanged. Raw Core creation/import remains opt-in, preserving
headless research and historical replay until the explicit Fjord adoption command.

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
| Upfront storytelling/music cost | 3 Food, no Materials |
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
Storytelling/music leaves campfire lighting to its independent Material/fuel command. The
#277 wedding and communal occasions below explicitly include their required fire in the quote.

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
Factual assistance after collapse (#278) uses the same earned-support bank, as documented in
[Contextual Support v0.2](CONTEXTUAL-SUPPORT-V02.md). Defence/newcomer integrations (#279/#280)
are deferred. Gathering animations/audio never grant assistance.

## Current 3D prototype

Ordinary Fjord campaigns expose the campfire sponsorship below Light campfire, including
Wedding celebration and Communal ceremony in the occasion selector. Weddings still require
a genuine partnership formed during the preceding game year; founding couples remain
ineligible. The separate autonomous contextual-help pilot remains behind `?culture=1`.
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
use the same optional SponsorGathering transaction, 3–8 available adults, two-assessment bank,
25% exposure-only benefit and legacy/default policy described above. Storytelling/music and
communal ceremonies cost **3 Food total**. Weddings cost **3 Food per recorded attendee**: eight
canonical attendees cost 24 Food; seven cost 21 Food. The roster is never reduced to fit available
Food. The decorative Low six-actor limit does not discount an eight-person Core event. A full
bank rejects sponsorship before spending. A separate wedding or ceremony bonus does not exist.
The neutral Communal Ceremony name establishes no specific gods, practices, priesthood,
religious affiliation or belief; it grants no weather reroll, fertility or raid modifier.

### Reviewed fire and resource costs

The owner additionally requires a burning campfire for new weddings and communal ceremonies.
The offer exposes total foodCost, foodCostBasis, foodPerParticipant, requiresCampfire and
materialsCost. SponsorGathering must include the exact reviewed quotedMaterials, including 0,
for either fire-requiring occasion. A changed roster, price, fuel-dependent Material quote,
missing resources or full support bank rejects the whole transaction before any resource change.

The shared existing campfire fuel implementation is authoritative. If fuel is 0, the transaction
buys the normal 1,000 burning ticks for 1 Material and lights the actual fire before committing the
cultural fact. This also covers the legal already-lit/zero-fuel boundary: the next ordinary purchase
is prepaid one command earlier, with no tick advance or fuel decrement. With positive prepaid
fuel, lighting or keeping the fire lit costs 0 Materials and preserves the remaining fuel exactly.
There is no extra ceremony fuel coefficient, lock, daily fee or guaranteed duration. Ordinary
SetCampfire and burning-tick purchase behavior are unchanged. The player can extinguish the
fire afterward; matching accepted request retries do not relight it or charge again.

The real CampfireFuelConsumed and CampfireChanged events precede the cultural receipt whenever
needed. Materials are debited and accounted for only by the fuel event, never a second time
from the gathering receipt. Storytelling/music still costs 3 Food total and does not require fire.

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

The wedding command adds sourceEventId and the reviewed Material quote to the existing
quote fields. The caller never supplies
authoritative spouses: Core derives them from the actual source. CulturalGatheringHeld freezes
sourceEventId and spouseIds alongside the normal real participant snapshots, cost and canonical
time. It creates no new PartnershipFormed event and does not redate the source, purchase a
partner, alter fertility, move a household or create children. Communal and storytelling commands
have no partnership source.

The existing version-1 cultural state/configuration and event ledger remain shared. New wedding
receipts explicitly record foodCostBasis:per_participant; both new fire-requiring occasions
record requiresCampfire:true, their actual Material cost and the IDs of any newly emitted fuel/
light events. One existing history pass validates the preceding real fire state and fuel without
a second saved fire ledger. New per-attendee receipts cannot omit the explicit pricing marker.

Genuine older unmarked flat-price wedding/communal receipts remain their accepted 3 Food facts,
without invented fire events, debit, migration or history rewrite. Their original matching
requests remain no-ops after reload or later changes. A frozen d43fff public-Core save covers
this compatibility: SHA256 10c4c7be49b3b00d43f9b2aebe1d92506fecd2176b31e0d41d5b894bc3575b13.
This is format compatibility rather than save authentication: an edited save can imitate the
legacy representation. No persisted wedding window, second receipt table or all-pairs
relationship graph is added. Candidate/history source
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
source integrity, actual per-attendee affordability, changed-roster requotes, real campfire
fuel/light accounting, atomic shortages, historical receipt compatibility, CPU isolation, and
common weather-support replay across save/load and split ticks. Controlled fixtures use existing saved rules; they do not establish population-level
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


### Owner-requested invitation and ceremony presentation

A new current, uncelebrated partnership can offer one compact non-modal wedding invitation in
Fjord Play. It names both real people and shows the full per-attendee Food and normal ignition
Material quote. Confirm commits through the same atomic command; insufficient stocks show
Not enough resources. Not now, close and Escape resolve only that invitation in saved presentation
metadata, also acknowledge its Attention record, spend nothing and leave the relationship intact.
Reading the partnership in Activity Center does not count as a ceremony decision. A per-history
cursor ingests appended canonical events and retains unresolved actual source IDs, at most one
current source per couple within the one-year window. Pending questions survive deferred flows
and reload; explicit dismissal or a real wedding receipt prevents replay. Legacy sidecars
initialize from currently unread eligible sources once. The manual campfire opportunity remains
available within the owner's existing window. Loading, backgrounding and another explicit flow
defer delivery without creating a new Core event or forced pause. No second economic,
relationship or cohesion state is introduced.

A fresh paid wedding or communal ceremony shows temporary decoration around the real burning
campfire. Weddings have an arch/garland and standards; communal ceremonies use neutral standards
and a garland. The two actual celebrating partners receive bounded Wedding name labels at their
moving head anchors. No attendee model, light, shadow map, texture or frame owner is added.
Static decoration stays visible when the foreground clock is paused; motion and sound retain
their existing pause rules. Suspension, hidden views, an extinguished fire, completion and
scene disposal hide or release presentation. Core costs and support do not depend on decoration.

The one active merged decoration mesh uses one material: 840 triangles for wedding or 616 for
communal, with 157,248 total attribute bytes if both variants have been cached. These are geometry
budgets, not measured mobile GPU/frame results. The existing motion/audio banks remain shared.

A real prepared-island fixture exposed short-waypoint passing that could circle a settled
attendee. Ceremony approach/retained-return actors now evaluate the actual next physical segment
before anticipatory passing. All existing terrain/body-clearance guards and route/node budgets
remain. Ordinary passing behavior is unchanged. The normal seed-2/terrain-227 fixture now gathers
with both partners at 24.5 active seconds, finishes the response at 31.5 and returns all staged
residents by 55.1 on Low six / Standard eight. No overlaps or renderer-caused Core changes occur
in these headless cases. See the #277 QA report for provenance and actual device limits.

A newly confirmed wedding or communal ceremony brings the camera close to the actual campfire
so the accepted event can be watched even if the player had been viewing another area. Declining,
failed commands and matching historical retries do not redirect the camera or restart a show.

### Running arrival and ceremony equipment

Following owner review, actual ceremony participants run toward the campfire using the shipped
Running clip and native measured gait. Ordinary work and return travel retain Walking; existing
collision/terrain/route limits remain. On the same saved fixture, gathering begins at15.8s
(previous Walking24.5s), response ends at22.8s and all staged actors return by54.5s.

Occupation tools are temporarily hidden while the actual presentation frame is active, including
paused approach and gestures. They return when presentation ends/suspends. Clothes/hats stay
visible; occupation/DNA/work and Core state remain unchanged. Hidden equipment releases its carry
grip. This reuses installed groups without asset downloads or refitting, including when an
occupation/wardrobe changes during the ceremony. See the #277 participation-v4 qualification.

## #288 — Firelight Vow presentation

An accepted wedding can show a skippable presentation using the actual spouses, oldest eligible recorded guest and up to three other recorded attendees as lyre/flute/frame-drum players. Remaining attendees clap. Roles are transient; they do not create occupations or change attendance, family state or Core RNG. Low stages at most six residents; Standard at most eight.

The selected owner music streams through the existing audio owner and drives approximately thirty seconds of local camera/hand choreography after the physical Run approach. Pause, mute, backgrounding and Skip restore safely. There is no extra charge, support contribution or marriage event. The existing 3 Food per canonical attendee and campfire-fuel quotation remain authoritative. Historical saves do not replay the scene automatically. See [#288 validation](../qa/wedding-cinematic-288/README.md).


The spouses extend both hands toward shared fingertip contact using their existing native rigs; feet and bone lengths remain unchanged. The female spouse wears the supplied flower crown and the officiant holds the supplied open book in both hands. These are temporary rigid accessories, removed with the performance. Cinematic overhead name boards are hidden, and normal safe shots use a lower viewpoint. A saved sound-on preference resumes from ordinary start/control gestures; explicit mute remains authoritative. The selected native music element is silently primed during accepted sponsorship and starts automatically once the staged cast arrives. Browser autoplay denial retains the optional Play music fallback.

### Owner fitting and audio follow-up

The flower wreath uses the fitted `socket_head_top`, centered and sized from the
current native posed HEAD surface. It temporarily hides the existing headwear
module and restores that module's original visibility on release. It does not
replace hair, identity, clothing selection or skeletons.

The selected song is now a positioned world stream at the actual musicians. Its
volume follows the ordinary listener and camera distance; other ambient/world
sounds keep their chosen volumes. Music consent, explicit mute, pause, background
cleanup, the existing MP3 and all canonical wedding costs remain unchanged.
[Feedback validation](../qa/wedding-wildlife-feedback-001/README.md).


### Mobile portrait camera follow-up

Once an accepted wedding owns its directed camera, its campfire does not need to
remain inside that camera's screen rectangle. Portrait shots may frame the actual
couple while the fire sits outside the image; this is composition, not loss of
clan visibility. The existing clan fog, page visibility, real participant/arrival,
fire-fuel, safe-camera, Skip and lifecycle guards remain authoritative. Ordinary
offscreen gatherings keep their existing suspension behavior.

Food is charged once at the accepted quotation. Reaching zero Food afterward can
raise the normal stock attention notice, but does not cancel the already accepted
presentation. The original wedding QA save contains exactly 24 Food, matching its
eight-person quotation; that fixture and the gameplay cost are unchanged.


## Fjord rollout and existing campaigns (29 October 2026)

New Fjord scenarios initialize the reviewed cultural rules. Continuing, importing, loading
locally or restarting a historical Fjord campaign uses the public idempotent
`UseCulturalOccasions` command for the player and existing CPU clans when needed. Each
newly enabled clan records `CulturalOccasionsEnabled` at its current canonical time and
starts with zero prepared support, sequence 1 and no previous gathering. Existing custom
culture configuration, previous events, relationships, time, RNG and stocks are retained.
No ceremony is bought or replayed by adoption. A real subsequent SponsorGathering command
still validates eligibility and spends the current quote. Save/load preserves adoption.

This rollout does not add contextualSupport to historical campaigns that lacked it, nor
activate that separate autonomous-help pilot in ordinary new Fjord scenarios. Explicit QA
campaigns and existing enabled support states retain their own configuration. Core loading
on its own never invokes the Fjord adoption command.
