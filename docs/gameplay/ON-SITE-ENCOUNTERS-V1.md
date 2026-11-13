# On-site encounters v1 (#308)

## Adoption and compatibility

Only new physical orders made after territorial-awareness adoption receive saved
version-1 encounter rules. Island tasks store them on task.encounterRules; new
free Explore journeys store them on the spatial mission. Historical regional
missions and already-dispatched physical journeys without that field retain their
original routes, RNG order, casualty timing and return-time transfer semantics.
Loading does not opt a historical journey into new combat.

Core owns all timing, eligibility, RNG and consequences. Rendering, camera,
pause, speed selection and repeated report reads cannot advance an encounter.
There is no offline catch-up. The normal clock, flat Food charge, weather duration
multiplier and reached land routes are reused. Combat, pickup or escort waiting
can extend the quoted operation window; it does not grant extra stock or capacity.

## Contact and autonomous exchanges

The saved lifecycle is approach, actual contact, engagement, resolution,
disengagement/physical return and final report. Records retain mission/site/clan
IDs, real participant IDs, reached position, ticks, dispatch/commit gear inputs,
actions, source-event references and outcome. Actual Hostile responders come from
the existing territorial incident. Dead, absent, indoor, child or caregiving
residents cannot silently join; a defender cannot be committed to two encounters.
Only real participants within the saved contact distance and terrain sightline
can act. The initial contact wait never disables a real guard still approaching:
response remains active until the capture window. A raid with no reached defenders
by that window does not create an army.

Both sides select one bounded action per reachable participant in stable order.
All actions are selected before either side's deaths are committed. The holder's
actual spear modifies action lethality; the target's actual shield modifies their
own exposure once. There is no additional legacy 60% victory or 10% casualty roll.
Defender death persists in the real source clan's households, work, relationships,
care and equipment. A dead mother immediately cancels her scheduled birth plan;
paternal death alone does not cancel one. Each death retains its exact tick and
cause, and immediately leaves living scene/movement participants.

### Provisional trial values

These coefficients are trial inputs, not owner-approved balance:

| Input | Trial value |
| --- | ---: |
| Actual contact distance | 3 metres with terrain LOS |
| Wait for reached contact at a raid site | 25 ticks |
| Exchange interval | 5 ticks |
| Maximum exchanges | 4 |
| Unequipped action lethality | 250 basis points |
| Own losses prompting disengagement | 50% of committed participants |
| Disengagement window | 5 ticks |

The existing spear bonus and wooden/leather shield protection remain 10%, 25%
and 40%. After the exchange limit, the smaller surviving side withdraws; a tie
causes the offensive party to withdraw. Both sides can withdraw after losses.
Zero living attackers is an immediate Lost outcome, never a homecoming. The
bounded comparison and pinned four-depart/one-death/three-home trace must remain
identified as limited trial evidence, separate from final physical acceptance.

## Recall, withdrawal and travel hazards

Recall before hostile contact creates no combat casualty. During actual
engagement it requests disengagement, holds the reached bodies and allows any
already scheduled exchange within the existing exchange budget. At the bounded
deadline, survivors follow their reached route home. Outnumbered surviving guards
use the same bounded disengagement before returning to their real homes. New
Recon, Surveillance and free Explore parties try to disengage automatically at
real hostile contact rather than intentionally completing a raid. A blocked return
is explicitly Stranded. Recall after a completed on-site capture keeps that
recorded operation and orders genuine delivery home.

The existing weather travel-risk component is sampled **once**, at the first
actual departure movement tick, using the dispatch snapshot. It records the
separate TravelWeather cause and reached location. Zero weather risk consumes no
outcome RNG. There is no late combat or weather reroll at return. Ordinary domestic
natural mortality remains owned by its existing annual rules.

## Capture, custody and arrival

Only a resolved successful Pillage can capture. Each living real carrier gets one
category in the checked priority order: up to 10 Food, 5 Materials, one actual
animal or one actual person. Stock is debited from the actual source immediately;
its manifest stays unavailable to home stocks until genuine arrival. No new loot
is drawn at homecoming. An empty or exhausted opportunity yields an empty manifest.

People and livestock require a real outdoor canonical position, terrain LOS and
a safe pickup route fitting the bounded eight-tick pickup allowance. Active
territorial defenders and people committed to another encounter cannot be taken.
Awareness-adopted clans save static livestock bodies from the validated layout
once. Core allocates genuine newborn bodies near the saved maternal/site anchor
on each tick using dry, reachable terrain and saved obstacles. Batching, speed or
extra projection reads cannot decide which newborn exists for capture. Farmyard
assignment changes shelter/work ownership without teleporting that saved body;
this slice adds no grazing AI or inferred yard relocation.

Escorts start at their own reached body, join their actual carrier, follow the
reached route and must physically reach home before ownership transfers. There
are no invented escort actors, cosmetic offsets or captive teleportation.

During transit the **source clan remains the single canonical identity/simulation
owner**, with an unavailable custody record. Custody blocks production, ordinary
consumption, reassignment and new expeditions. Livestock cannot feed, breed, trade
or be slaughtered. The source's normal aging and natural mortality still apply
once. Pending maternal delivery is deferred while in custody; real arrival uses
the established identity, ancestry, household and pending-birth transfer contracts.

| Transit event | Deterministic initial policy |
| --- | --- |
| One carrier dies | Their Food/Materials are lost; their person/animal is released at its actual reached position. Other slots remain with their original living carriers. |
| Engaged attacker retreat or Stranded route | Forfeit held stock and release held people/animals once. |
| Zero survivors | Forfeit/release as above, record Lost, keep returnedAt null and emit no homecoming. |
| Successful ordinary homeward order | Keep the already captured manifest; credit each surviving slot once at actual arrival. |
| Released source entity | Remains unavailable while walking a strict source-home route at 0.6 metres/tick; no route means explicit stranded custody. Availability resumes only at actual home arrival. |

A party lost aboard a longship releases the actual hull at its reached sea
position. A surviving recovery party can physically reach and board it; loss
does not teleport a vessel home or leave it reserved for dead crew.

Delivery transfers the original identity once and records its actual arrival
reference. Source bodies disappear as recipient bodies appear. Death, release,
delivery and repeated save/continue cannot duplicate stock, identities or gear.

## Knowledge, history and saves

Panels show own living/casualty counts, observed defender count, phase and the
manifest's empty/in-transit/delivered/released/lost state. Unseen enemy names, gear, exact stocks
and private action rolls are not projected. Existing fog filters apply to bodies.
Minimal facing/idle stance uses actual committed visible opponents; later combat
animation work can use saved actions without inventing strikes or wounds.

Chronicle, Attention, personal history and Clan Book account for factual contact,
on-site losses, source capture debit and genuine arrival. MissionCargoDelivered
is a delivery receipt; ExpeditionReturned remains the single home-stock ledger
credit. Lost reports explicitly say no party returned. A later report never
postpones a canonical death or capture.

Optional encounter and custody version-1 data are validated on ordinary and
portable load. Validation checks dispatch/commit/action receipts, real rosters,
bounded policies/ticks, one active defender reservation, actual custody routes,
source ownership, manifest conservation, delivery receipts and terminal phase.
Core saves do not embed another terrain field. Owner desktop/physical-touch UAT
is deferred to the combined combat/offense QA; automated and emulated checks do
not substitute for it.

## Native encounter presentation

The same-rig visual layer samples registered participants, exchange receipts and
canonical ticks without changing these rules. See [encounter presentation](ENCOUNTER-PRESENTATION-V1.md)
for pose, pause/restore, visibility and recorded-casualty contracts.
