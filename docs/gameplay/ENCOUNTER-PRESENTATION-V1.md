# Encounter presentation v1 (#310)

This slice makes the existing on-site encounter legible on the same native Meshy
character. It adds no combat rule, balance value, equipment slot or outcome. The
[on-site encounter owner](ON-SITE-ENCOUNTERS-V1.md) remains authoritative for
participants, actions, deaths, withdrawal, cargo and arrival. Personal equipment
and field clothing follow [visible equipment](VISIBLE-EQUIPMENT-V1.md).

## Facts before poses

The root campaign's saved encounter records and linked source receipts supply the
participant, phase and exact tick. A resident receives only a bounded presentation
cue for its actual participation and at most the latest two registered exchange
windows. Rival cues pass the existing per-body current line-of-sight boundary; map knowledge does not
reveal hidden residents, their routes, loadout or opponent positions. Scene data
must not contain rolls, probabilities or future exchange deadlines.

An exchange can record both an outgoing attempt and an incoming result for the
same person. Its outgoing and response portions are presentation of that same
registered exchange, not additional attacks or a more detailed invented history.
The capped display tick selects a recorded window with its original stable keys,
keeping the prior response while newer facts wait for interpolation to catch up.
The final exchange remains available for one extra span after its normal end;
a pose still plays only inside its own recorded interval. This bounded retention
prevents a final response disappearing at resolution and adds no queued replay.
An action faces its own currently observable recorded point; an unobserved point
never falls back to another exchange's opponent.

Actual equipment selects a spear action or an unarmed strike; an actual blocked
result and actual shield permit shield defence. A survived result permits a brief
brace, without inventing an injury, blood or an injured walk.

## Existing rig and source motion

Exploration and combat use the normal fitted tunic and low shoes, preserving the
same body, face, hair and beard. The actual assigned props remain native hand
modules. Occupational hats and tools return through the existing home/work owner.

The supplied character already includes `Attack` (2.833 seconds) and
`Fall_Dead_from_Abdominal_Injury` (3.5 seconds). They remain the source motion; no
new Meshy generation, paid download, body, skeleton or renderer is required. The
existing Attack is a two-arm overhead swing. A measured source review found the
carried spear pointing backward during part of it, so a bounded native arm/wrist
correction is required for the spear presentation. The correction must preserve
its actual hand grip and clothing coverage. It must not move the navigation root.

Carry-arm posing and hand/finger closure have separate precedence during combat:
action arms must remain visible while the actual prop stays gripped. Ordinary
Idle/Walk/Run and occupation animation retain their existing defaults. Animation
sampling must not refit or reinstall the body, garment or equipment each frame.

## Transition and clock contract

Priority is recorded casualty, registered exchange action/response, active ready
or disengagement stance, canonical route locomotion, then ordinary work/culture.
A recent terminal exchange cue cannot hold a returning party or keep combat
clothes active indefinitely. Contact readiness cannot stop an unfinished route. A newly committed party first
finishes any lagging, already confirmed display segment through the existing
collision controller. It holds the actual reached source point, without a new
formation offset, teleport or navigation route. Ordinary Walk/Run and route
facing remain visible during that catch-up; recorded action poses retain priority. A resolved encounter retains
its final two source windows only until two exchange spans after its final
exchange, allowing a lagging display tick to finish the known response. The
resolved cue is inactive; only the window containing that actual display tick
can pose an action, and homeward movement remains under its existing owner.

Pose age follows known canonical ticks using the existing render interpolation.
It never advances beyond the known snapshot. Pausing or hiding the page freezes
that interpolation; a speed change changes the mapping to the next known tick.
Camera changes do not restart actions. Loading a save samples the current bounded
phase directly, without a queued replay or a repeated source event.

## Recorded casualties

A short corpse presentation requires an exact existing Combat death receipt and
position. It retains the named resident's existing appearance and the real gear
committed to that encounter, even though Core has already recorded its loss.
That temporary appearance grants no inventory, protection or living actor.

The death source's horizontal hip drift is constrained inside the skeletal pose,
so the visible fall remains at the canonical casualty anchor. Vertical fall and
source rotations remain. Exact and later terminal samples stay fallen. The body
cannot resume walking, working, production, selection or ordinary traffic; it is
removed when the canonical presentation window expires or current enemy sight is
lost. Save/restore and re-entry must not restart a fall or resurrect a resident.

## Evidence and limits

Tests use the agreed public projection, native factory, scene/session and save
seams. Required evidence includes actual in-game approach, ready, exchange,
response and withdrawal/end views, pause/speed/camera/save continuation, exact
Core parity with absent or differently paced rendering, and fitted real clothing
and equipment. A standalone pose preview is supporting evidence only.

Runtime samples must identify source, population, camera, quality and concurrency.
Desktop Chrome and touch viewport emulation do not certify physical iPhone
Safari, device temperature or long-session performance. The owner has deferred
physical acceptance to the combined combat/offense QA; the PRs remain drafts.
