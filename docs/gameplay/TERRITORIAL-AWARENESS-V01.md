# Territorial awareness v0.1

Status is implemented on the draft feature branch for [#306](https://github.com/sidesliders1983/Pillagers/issues/306),
the first implementation slice of [#305](https://github.com/sidesliders1983/Pillagers/issues/305).
The starting source is main commit `decdc07881b80ff17195bfdef60940506af88b87`.
This document records the versioned implementation contract. Main and public Sites remain unchanged until review and merge.

## Player behavior

An expedition can pass at a distance, remain concealed by terrain, be noticed at
the perimeter, enter a settlement after a warning, or begin a visible offensive
operation. A noticed visitor can withdraw using the existing group-level Return
home command. Residents watch, approach to warn, gather or withdraw according to
the same saved incident. Only present, available residents can respond.

## Canonical presence

A physical expedition member already has a saved route and confirmed distance.
Use `spatialMemberPosition` for visitors. Exclude prepared and returned missions,
dead members and passengers aboard a ship from local land intrusion checks.

Local residents currently have display anchors and cosmetic movement. Territorial
detection requires a saved presence record per actual person. Establish home
exteriors from validated island and residential placement facts, then preserve
the current route and position independently of rendering. Movement must use
existing dry-land routing and household exclusions. A bounded local ambient
route and a response route share the same authoritative position.

A person's presence belongs to that person's own `SimulationState`, including the
persistent rival's nested state. Temporary duty retains their occupation but
makes ordinary work and conflicting assignments unavailable. Caregivers, young
children, absent expeditions, miners away from home and deceased residents
cannot become available responders by opening a view. Noncombatants can withdraw
along a reachable local route.

Rendering follows saved presence and duty motion. A cosmetic work trip must not
leave its resident visibly far away while detection still uses a home anchor.

## Incidents and observations

The physical world's saved incident collection owns a version, world identity,
policy and stable sequence. Each incident links the defending clan, visiting
clan, mission and group. Two groups receive separate incidents and share one
responder reservation authority.

Each observed transition records the observer identity, intruder identity,
canonical tick and their confirmed positions. All legitimately seen group members
are considered: an observed member inside the settlement takes priority over a
member seen only at its perimeter. Stable identity order breaks equivalent ties.
An unseen member cannot supply proximity or escalation evidence. Distance and exact
`traceTerrainSightline` checks authorize detection. A camera, a settlement-wide
discovery mask or an unseen mission order cannot authorize it.

The first sighting opens Suspicious or Alerted. Unaware has no incident record.
A detected deeper intrusion warns before escalating to Hostile. Withdrawal,
loss of contact or disappearance closes the linked incident. The versioned
trial policy saves these bounded values.

| Setting | Trial value |
| --- | ---: |
| Detection sample | Every 5 canonical ticks |
| Observer radius | 32 m |
| Observer eye height | 1.7 m |
| Warning grace | 25 ticks |
| Loss of contact | 50 ticks |
| Re-entry cooldown | 100 ticks |
| Maximum responders per incident | 2 |
| Maximum pursuit from home | 48 m |
| Canonical resident movement | 0.6 m per tick |
| Local ambient destination interval | 25 ticks |
| Local ambient radius | 4 m |
| New-resident exterior search | At most 16 m from the saved household anchor |
| Indoor placement retry | Every 25 canonical ticks |

A visiting group must be actually observed within this radius. The selected
destination alone cannot cause a warning. An outside destination can still
warn if its confirmed route crosses the settlement interior. Both defending
clans use the same contact query and eligibility rules. The current visitor
controller creates no CPU expedition orders.

A perimeter observation leads to watching. A detected deeper intrusion leads to
a warning and bounded local response. Ignoring that warning or witnessing an
offensive operation can produce a versioned engagement request. Carrying a
shield alone cannot make an incident hostile. Detection must precede using a
visible hostile act as escalation evidence.

The engagement request records the incident, local location, tick and eligible
sides for the later on-site resolver. The current slice labels that pending
integration in the player view. It adds no damage or loot resolver.

## Tick and availability order

The current economy, mining and physical-expedition tick order remains the
foundation. Awareness runs after their canonical tick. It reconciles deaths,
departures and care changes, advances saved local routes, evaluates sight and
assigns duties for subsequent work ticks. A new warning cannot erase production
from a tick that already happened.

The same duty read must reach local and rival `inspectWork`, production,
expedition eligibility, mining, caregiving and cultural availability. Releasing
a duty resumes the person's ordinary role from the reached location. Recall,
death, disappearance, transfer and loss of an observer reconcile safely.
Responders stay within the incident's local pursuit limit. Canonical movement
waits for resident body clearance and can retry a blocked local route through
the existing terrain router.

A newly sponsored cultural receipt reserves its actual participants from
territorial observation and response for 250 canonical ticks. The existing
cosmetic performance can use that interval and is released when the reservation
expires. A fast simulation clock can therefore shorten that cosmetic overlay.
The reservation is saved and its expiry never depends on a render callback.
Earlier campaigns use their existing cultural presentation behavior.

## Player knowledge and history

Core records private factual identities. The player projection exposes only
legitimately observed reaction details and player-owned participants. Rival
residents keep the existing anonymous Observed resident label. Apply fog checks
at each person's canonical position, including visible outskirts when the
settlement centre is unseen.

Attention, Activity Center and Clan Book share one linked incident chain.
Phase updates cannot create a new alert every tick. Generic participant/name
fields must not disclose a hidden defender roster. A warning includes the
existing group-level Return home action, presented as withdrawal where relevant.

## Saved campaigns

New physical Fjord campaigns adopt presence before the scene starts. Existing
physical campaigns can explicitly adopt using the territory review entry.
Adoption is versioned. Existing historical and in-flight missions
retain their saved outcome rules. New participating missions identify the
awareness version under which they departed. Detection is independent of camera,
pause, render cadence and browser visibility.

Structural validation runs during Core reconstruction. Geographic validation
runs when the physical world is bound. Validate route geometry, duty ownership,
observation provenance, world identity, timestamps and unique responder
reservations. Loading cannot replay warnings, reconstruct new earlier events,
advance time or duplicate responders.

## Reusable Core contract

`initializeTerritorialAwareness(state, context, policy?)` or the public
`EnableTerritorialAwareness` command adopts both clans. The physical context supplies
validated home exteriors only at adoption. Afterwards, saved positions and homes
are authoritative; new identities receive a deterministic safe exterior through
the existing terrain router. Initial home normalization is bounded to 8 m; a new
identity searches at most 16 m from its saved household anchor inside the saved
settlement bounds. If no separate connected exterior exists, the named resident
stays in a saved indoor placement state. The household anchor is a reference,
not an outdoor body. A captured arrival without a saved household relative uses
the actual returned crew position recorded by its transfer receipt and mission.
The campfire is not an invented arrival doorway.

Indoor placement retries every 25 canonical ticks. It reserves a separate dry home
when possible, but the person appears outside only after the exact saved exit is
clear of bodies and blockers and an existing terrain route connects it to that home.
Movement then follows the ordinary swept route; the person cannot jump through an
obstacle. Young children and caregivers use the same safe emergence gate. Space
exhaustion never stops other residents, births, aging or the campaign clock.

Indoor people have no outdoor body, observation, response duty, expedition departure,
mining assignment or ceremony attendance. An otherwise work-age adult waiting for
an exterior has zero productivity with reason `awaiting-exterior`. Normal childcare
and underage reasons keep their existing precedence. Indoor residents can still
provide ordinary household care. No fertility or aging rule is changed.

The optional actor `placement` records version, indoor phase, current reason, anchor,
need for an allocated home, entry tick and next retry. Earlier actor records without
this field remain valid and preserve their serialized representation on import.
Canonical resident route planning uses the existing solver's strict-navigation mode
and validates immutable terrain before saving a new route. The same strict route
checks still apply on world bind; invalid future connectors are not committed.
Other callers retain the solver's existing default behavior.

Rendered positions cannot become departure origins
for newly participating exploration, island missions or longship boarding.

`world.territory` stores version 1, world/adoption identity, the adoption receipt,
policy, next incident sequence and incident snapshots. Each owning clan's
`residentPresence` stores its own actors, confirmed routes, temporary duty and
availability intervals. Closed snapshots beyond the latest 2,048 can be compacted
after their re-entry cooldown; their immutable source events remain history.

An incident links the actual defending/intruding clans, mission and group to one
confirmed observation and its source event IDs. `TerritoryIncidentOpened`,
`TerritoryIncidentChanged` and `TerritoryIncidentClosed` carry versioned private
facts. `inspectTerritory` and the shared history adapter expose only the permitted
player projection. `territorialContact` applies the same real-person eligibility,
distance and terrain query for either defending clan.

A Hostile transition stores `engagement = { version: 1, requestedAt, position,
defenderIds, intruderIds, sourceEventId }`. The later on-site resolver must consume
that existing incident/request and retain its provenance; it must not derive a new
outcome from a renderer callback or regenerate defenders. Existing mission outcome
rules continue until that separate integration is implemented and versioned.
## Required proof

- Seeded distant pass, blocked terrain LOS, detected perimeter visit, deeper
  intrusion and observed Pillage initiation.
- Visible warning, usable withdrawal, bounded pursuit and eventual de-escalation.
- Actual eligible resident identities, paused ordinary production, safe release
  and the same availability rules for both clans.
- Concurrent groups, responder ownership, recall, death and disappearance.
- Identical state through split and batched ticks, pause, off-screen rendering,
  save/load and identical command replay.
- Fog-safe notifications and history linked to the same incident.
- A pinned Fjord Play build and seed showing benign and detected visits on
  desktop and mobile browser. Physical-device results are recorded separately.

The owner approved the public Core commands and inspectors, terrain sight
queries, resident availability, save/load/replay, expedition/history controls
and desktop/mobile browser behavior as the TDD test boundaries.

## Supplied assets

The owner supplied the [Drive folder](https://drive.google.com/drive/folders/1KLQh4TMMHZmr6WPw2UpUOzJRMUouGaVV).
Its current inventory contains seven weapon/shield GLBs, four helmet/bust GLBs
and one octopus GLB. Weapon and shield fitting belongs to #309. The epic defers
body-armour and helmet mechanics, so these files do not approve new equipment
slots or protective statistics.

## Recorded validation

The [pinned validation record](../qa/territory-306/README.md) contains the 97-test
focused run, all ten current island adoption checks, native Chrome desktop/touch
journeys, captures and explicit physical-device and terrain limits.
