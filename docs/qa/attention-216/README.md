# Attention #216 validation

Measured 2026-10-20 on Windows, Node 24.19.0. Timings are diagnostic observations,
not frame-rate guarantees; the full test suite ran concurrently.

Run `node scripts/qa/attention-216.mjs` to regenerate paused, real-game unread/read
checkpoints under `scratch/attention-216/`. The fixture explicitly funds seed 32 and
advances three years through Core; it produces five real births, not fabricated UI
notifications. The fixture is separate from normal campaign balance.

`measurements.json` records the actual fixture, bounded projection of 100,000
synthetic source records, 1,000 repeated index reads, 1,000 cached campaign reads,
and exact Core/read-state round trips. The synthetic history copies one genuine
birth every twentieth source record; it is a stress workload, not gameplay evidence.
The inbox retains 200 records, its recent Chronicle cache 100, old-history requests
scan at most 200 source records, and each rendered page contains at most 20 facts.

`tests/attention.test.mjs` exercises real birth, partnership, death, expedition
commands, historical names, active/past destinations, quiet routine events,
read/ack episode deduplication, save/load/rollback/restart and unchanged canonical
state/clock intent. `tests/attention-dom.test.mjs` uses the real Attention and Clan
Book components in jsdom: condition acknowledgement, grouped births, detail reads,
character/family navigation, stable focus, stale campaign clicks, unavailable
historical targets, Escape and Chronicle. No browser rendering is emulated.

The existing workspace, weather panel, desktop/mobile shell and native button events
remain shared. Buttons have a 44px minimum height and severity is expressed in text
as well as color. Browser inventory currently exposes no enabled browser, so CSS,
WebGL, desktop layout and physical phone/touch UAT remain unverified. These DOM tests
are interaction evidence only; no visual acceptance is claimed.

No gameplay rates, event emission rules, save schema version, RNG or pause policy
changed. Unsupported future combat/diplomacy/skills remain unsupported. Adoption of
old saves suppresses historical unread replay; current conditions still appear.

## Owner follow-up: short notifications

`tests/attention-toast.test.mjs` exercises actual annual social events, real funded
multi-year births, physically prepared expedition return travel and new Food
shortage conditions. The full focused set (Attention model/DOM/toast plus existing
personality life events) passes 27 tests. DOM checks cover no focus theft, held
expiration, Escape/dismissal, exact detail navigation, no automatic read/acknowledge,
reload and hidden-period silence, bounded catch-up delivery and unchanged Core/clock.
The test uses controlled timers; it does not wait eight wall-clock seconds per card.

The UI uses existing Fjord icons/colours, safe-area offsets, 44px actions, polite
announcements and reduced-motion CSS. The supplied phone screenshot is a design
reference, not proof of the updated rendering. Browser inventory is still empty;
physical device, CSS layout and WebGL UAT remain unverified.
