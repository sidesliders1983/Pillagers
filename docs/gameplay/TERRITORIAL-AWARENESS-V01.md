# Territorial awareness v0.1

Status is under development for [#306](https://github.com/sidesliders1983/Pillagers/issues/306),
the first implementation slice of [#305](https://github.com/sidesliders1983/Pillagers/issues/305).
The starting source is main commit `decdc07881b80ff17195bfdef60940506af88b87`.
This document describes the intended contract. It does not certify shipped behavior.

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
canonical tick and their confirmed positions. Distance and exact
`traceTerrainSightline` checks authorize detection. A camera, a settlement-wide
discovery mask or an unseen mission order cannot authorize it.

The phases are Unaware, Suspicious, Alerted and Hostile, with closure after
withdrawal or loss of contact. Configured sample intervals, warning grace,
contact loss and re-entry cooldown must be bounded and saved. Select experimental
values during the first behavioral slice and document the resulting examples
here before review.

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
Responders stay within the incident's local pursuit limit.

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

Adoption is explicit and versioned. Existing historical and in-flight missions
retain their saved outcome rules. New participating missions identify the
awareness version under which they departed. Detection is independent of camera,
pause, render cadence and browser visibility.

Structural validation runs during Core reconstruction. Geographic validation
runs when the physical world is bound. Validate route geometry, duty ownership,
observation provenance, world identity, timestamps and unique responder
reservations. Loading cannot replay warnings, reconstruct new earlier events,
advance time or duplicate responders.

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

The public Core commands and inspectors, terrain sight queries, save/load/replay
and the expedition/history controls are the proposed test boundaries. User
confirmation of these boundaries is pending before new TDD tests are written.

## Supplied assets

The owner supplied the [Drive folder](https://drive.google.com/drive/folders/1KLQh4TMMHZmr6WPw2UpUOzJRMUouGaVV).
Its current inventory contains seven weapon/shield GLBs, four helmet/bust GLBs
and one octopus GLB. Weapon and shield fitting belongs to #309. The epic defers
body-armour and helmet mechanics, so these files do not approve new equipment
slots or protective statistics.
