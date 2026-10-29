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
