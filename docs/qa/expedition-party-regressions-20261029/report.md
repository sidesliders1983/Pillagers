# Expedition party regressions — 2026-10-29

Base: main `aad08bf5712c57ee141ee423713072bad9813eaf` (PR #303).
This follow-up does not change the already published cadence/culture rollout.

## Scope

- Away residents: neutral tunic, ordinary shoes, DNA hair/face, no occupation
  ensemble, hat or tool. Portraits follow the same presentation. The Core
  occupation/equipment and identity remain intact; homecoming restores workwear.
- Home crews: public `DisbandExpeditionGroup`, blocked while Prepared or away.
  A validated dated receipt and optional roster archive retain returned missions
  and prevent reused group IDs. Repeating an already completed disband is inert.
- Arrivals: bounded local standing slots on known dry navigable ground, avoiding
  steep terrain, scenery and visible plots. Local presentation steps pause with
  the session and rejoin confirmed travel when recalled or redirected. No Core
  route, discovery, cost or RNG mutation. Narrow terrain can lack enough slots.
- Settlement and home/tent residents: canonical `Name (age)` labels.

## Executed validation

The public Core/campaign, wardrobe/factory, actor layer and DOM seams were already
approved in this task. The arrival test first failed because all three bodies
occupied the same destination. The initial wardrobe and disband tests likewise
failed before their implementation; logs are retained in the ignored local QA
folder, alongside the earlier release evidence.

Reproduce on Node 24 with the locked pnpm 10 dependencies:

```sh
pnpm install --frozen-lockfile
node --test tests/fjord-clothing.test.mjs tests/fjord-travel-presentation.test.mjs tests/home-residents-dom.test.mjs tests/expedition-mode.test.mjs tests/longship-transport.test.mjs tests/world-expeditions.test.mjs
pnpm run build
pnpm run validate:public --tracked
pnpm run validate:characters --lab-previews
node --test --test-concurrency=2 tests/*.test.mjs
```

The targeted suite passed 65/65. It exercises real fitted clothing removal and
restoration without replacing the actor, real physical travel/return and completed
legacy missions, save/load, archive tampering, two existing crews, new unique IDs,
actual UI disband commands, ages in desktop/mobile home and directory views,
pause, known-ground/tree clearance, stable loaded arrivals and untouched Core
serialization. TypeScript and the production build passed. Source formatting was
reviewed manually; this repository has no configured formatter. `git diff --check`
passed.

## Visual review

Local preview: `http://192.168.68.100:5191/fjord-play` (fully reload).
Browser automation is disabled in Work settings. Owner review of the four
follow-ups has been requested and remains pending; the earlier owner pass covered
only running cadence and campfire occasion options. This report does not claim a
browser or physical-device pass for the follow-ups.


## Owner follow-up: shared collision during travel

The owner accepted neutral expedition clothing, home crew disbanding and resident
ages, but rejected the arrival-spacing implementation: bodies still crossed during
travel and only separated after reaching the same point. The initial spacing pass
is therefore not a visual acceptance of collision behavior.

A new real-Core/actor/controller test reproduced an overlap at render frame 41
(2.05 seconds). Expedition actors had been excluded from LivingWorldController and
were directly assigned interpolated coordinates. They now share the ordinary body
registry, swept body checks and existing neighbour-passing geometry. The arrival
helper only reserves goals; it no longer moves bodies. Existing actors retain their
actual rendered pose across Core updates and new orders. While blocked, they Idle;
walking/running animation receives their measured movement speed. Away actors are
excluded from autonomous work, wandering and social/cattle encounters.

Two deterministic fixture runs each check 2,100 steps at 50 ms, including a new
destination, Core refreshes and pause. The crossing case includes two opposing
crews plus a real non-expedition resident. Minimum body-centre distances measured
0.9645832995 m and 0.9663797069 m against the existing 0.96 m two-resident clearance.
Maximum displacement was 0.25 m per step in both cases. Both crews reached their
own destinations; the final body-overlap counter was zero. Every Core refresh
preserved the actor poses and serialized campaign state. These are headless fixture
measurements, not a claim of device performance or completed visual UAT.

Additional focused tests cover ceremony navigation, normal resident passing,
Farmyards and native longship passengers. The final collision pass still requires
owner visual review on the same LAN link after a full reload.


Executed after the collision integration: all 87 tests in the eleven test files
using LivingWorldController passed, as did a separate 37-test compatibility run
for ceremonies, passing, Farmyards and longship passengers. TypeScript, the
production build/public asset validation and `git diff --check` passed. The prior
full-suite baseline completed with 1,616 tests: 1,606 passed, no failures and ten
existing optional authoring-fixture skips. That baseline is not claimed as an
exact-head full-suite pass for the subsequent collision integration; GitHub CI
must validate the final commit before this draft PR can be merged.


## Additional owner request: optional HDR menu control

The collision fix at `6d4cd8339180fb8a91026212b1596ad55b218146` received owner
UAT acceptance and both exact-head GitHub checks succeeded. Before merge the owner
requested the earlier HDR spike as an optional in-game quality setting. Merge and
publication therefore wait for the expanded head, rather than publishing that old
head while implementation continues.

HDR uses the exact pre-existing 1K source (SHA-256
`162e8a4a42db3b26c8a5e4558db5355df156212a55127577725692f683106fa4`).
No generated source, new texture or source-model addition is involved. Existing
quality/presentation, renderer asset/loading lifecycle and Core/save seams are
reused. Tests cover the actual menu control, opt-in/lazy loading, day/night,
off-time resource release, late loads, failed loads without retry loops, context
restoration, twenty toggles and sidecar compatibility with unchanged Core.
The native loader decodes the actual source at 1024 x 512. Headless ownership tests
use the resource-loading boundary; they do not constitute a real GPU or device
performance measurement. Browser automation remains disabled; HDR visual UAT is
separate from the already accepted expedition collision repair.

```sh
node --test tests/hdr-lighting.test.mjs tests/presentation-quality.test.mjs
```


HDR validation completed locally: 29 focused tests passed across the new control,
presentation preferences, shared settlement handoff/import, Fjord lifecycle,
lighting and island loading. TypeScript, production build/public asset validation
and manual source-format/diff checks passed. There is no configured formatter.
The same LAN preview was rebuilt and a separate owner HDR review was requested.
The accepted expedition behavior was not changed by this additional slice.
