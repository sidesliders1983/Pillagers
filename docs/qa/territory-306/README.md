# Territorial awareness (#306) — validation record

Date: 2026-11-12. Runtime source: `8673809d615d9a7d33e9403bcc10d28a973728a3`.
Starting main: `decdc07881b80ff17195bfdef60940506af88b87`.
This records the first slice of epic #305 on its draft branch.

## Automated contracts

The final focused run passes **97/97 tests across 13 files**, with no skipped tests.
It covers distant and occluded contact; perimeter, warning and hostile transitions;
actual observed Pillage; re-entry; real responders and shared reservations;
care, death, recall and cultural availability; canonical departure origins; legacy
missions; save validation; render independence; and linked history.

Run `node --test --test-concurrency=3` with these files under `tests/`:

- `territorial-awareness.test.mjs`, `territorial-campaign.test.mjs`,
  `territorial-presence-view.test.mjs`, `territory-ui.test.mjs`, `territory-history.test.mjs`
- `island-missions.test.mjs`, `longship-transport.test.mjs`
- `attention-toast.test.mjs`, `attention-dom.test.mjs`, `chronicle.test.mjs`,
  `personal-history.test.mjs`, `cultural-presentation.test.mjs`, `fjord-bridge.test.mjs`

The real production-island birth test advances one session 6,003 ticks and a restored
session 1,002 + 1 + 5,000 ticks; their Core bytes match exactly. Another 100 ticks,
batched versus individual, also match. The actual child reaches age five with a
separate exterior, becomes visible and advances on a collision-checked route.

Production build, `validate-public-assets --tracked`, and
`validate-characters --lab-previews` pass. The existing Vite large-chunk warning
and Three CommonJS deprecation remain warnings. No validation was bypassed.

All ten geographies in `island-pool-v3` pass adoption, exact Shared/Core roundtrip,
one canonical tick and a second exact roundtrip, with ten actual residents per clan.
The geography → campaign seed mapping is 18 → 0, 7 → 25, 15 → 26, 79 → 16,
88 → 1, 101 → 5, 112 → 8, 168 → 9, 195 → 4 and 227 → 2. Prepared public geography
bytes and hashes were verified. See `current-pool-smoke.json`.

## Focused browser journeys

Native installed Chrome **157.0.8103.52**, headless, tested desktop 1440×900 and
touch landscape 844×390 in fresh isolated contexts. No page errors occurred.
Normal New game → New arrival (random campaign seed 1044826607, no preview query)
activated territorial awareness and both clans' presence before the canvas became
ready. The adoption receipt was present in the first activated save.

Desktop and touch both distinguish a benign pass from perimeter watching and a
deep warning. Actual click/tap on **Withdraw group** sends the crew Returning;
the incident closes and both people return home. Activity shows one Territorial
encounter chain, with sighting at tick 590, warning at 595 and closure at 645.
Its three original source events survive reload and Continue without replay.

The [first raw run](browser-first-run.json) records a harness failure at reload:
it waited for the canvas while the normal Continue menu was correctly displayed.
The product warning, withdrawal, closure and homecoming assertions had already
passed. The [passing continuation](browser-continuation.json) performs the missing
Continue action, checks the returned-save chain and provenance on desktop, and
runs the remaining touch journeys. This required no product change. The original
failed measurement is preserved.

| Capture | Observed result |
| --- | --- |
| [Normal new campaign](desktop-new-game-default-territory.jpg) | Default adoption before scene readiness |
| [Benign pass](desktop-benign.jpg) | Exploration without territorial notice |
| [Perimeter](desktop-perimeter.jpg) | Generic watching notice |
| [Warning](desktop-warning.jpg) | Readable warning and Withdraw group control |
| [Withdrawal](desktop-withdrawing.jpg) | Existing return action owns the journey |
| [Linked history](desktop-linked-history.jpg) | One factual source chain |
| [Touch warning](touch-landscape-warning.jpg) | Warning and actual tappable Withdraw control |

Expedition fixtures use campaign seed 7, recipe `island-pool-v1`, world identity
`fjordside-island-v0.3e-r3:7:cd6d7319`, Summer 800. The real group **Coast watch**
contains Bireha and Mieppi. Initial QA funding is 2,000 Food / 200 Materials;
births, partnerships, mortality and weather are disabled for repeatability.
Supplies still use the ordinary 8 Food per person.

| Journey | Public requested destination | Confirmed outcome |
| --- | --- | --- |
| Benign exploration | (66.6, -56.6), adjusted to (74, -54) | No incident |
| Perimeter visit | (18, -88) | Suspicious at tick 590; watches while outside |
| Deep intrusion | (26.6, -64.6), adjusted to (26, -64) | Suspicious at 590, Alerted at 595 |
| Return from warning | RecallExpedition at 595 | Returned and Closed by 690 |
| Ignore warning | Advance 35 ticks from 595 | Hostile by 630; engagement request only |

Every exported checkpoint restores exactly while paused. Fixtures use public
group/start/explore/tick/recall commands; they do not insert events, responder duties
or physical positions. The route to east-perimeter target (43, -57) was rejected as
a benign proof because its actual path enters the settlement. Classification
considers the travelled route, not only its final flag.


### Scene and touch-scroll confirmation

[The normal-camera scene capture](scene-warning.jpg) shows the actual warning
approach after Play advanced the incident to tick 609, still Alerted. The first
rendered responder is near the crew at (13.51, -68), with canonical duty `warn`,
confirmed movement and facing (26, -64). Perimeter captures also show two rendered
watching actors facing the party. Only ordinary Play, Show group, camera orbit,
zoom and group-panel collapse were used. The [compressed raw reaction trace](scene-reactions.json.gz)
retains the source version, canonical and rendered positions and camera facts.

A native touch swipe scrolls the real history workspace and exposes all three
incident entries, with no clock advance. See [the legible scrolled capture](touch-history-scrolled.jpg)
and [raw gesture/result record](touch-history-scroll.json). The root reviewer
visually inspected the desktop warning, benign pass, scene reaction and mobile
warning/history captures.
## Limits

Terrain occlusion is proven with seeded Core terrain and actual observer positions.
The production seed 7 search found no suitable all-observer-concealed dry point within
32 m of its homes. A seed 18 candidate is not browser evidence because the public
safe route search rejects that approach.

Touch landscape uses native Chrome input/viewport emulation. Physical iPhone UAT has
not been performed. Scene reactions consume canonical walking, facing and withdrawal;
dedicated combat clips, equipment fitting and local casualties/loot are later child
integrations.

Cultural participants are reserved for 250 canonical ticks. At a fast clock this can
shorten their cosmetic ceremony. Saved homes remain authoritative; initial exteriors
normalize within 8 m and new identities search at most 16 m inside the saved settlement
bounds. Exhausting the bounded exterior search reports an error rather than placing
overlapping people. These trial policies are recorded in the current gameplay contract.
