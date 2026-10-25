# Onboarding #263 — implementation QA

- Source base: main `12518aec36ac0d12bb6fafba8d7856ecc23bc4a3`.
- Feature workspace: `D:/CodexSites/Pillagers/scratch/first-steps-263`.
- Preview: `http://127.0.0.1:5243/fjord-play` (isolated origin; use New scenario).
- No gameplay balance, initial stocks, seed, founder, mission, weather or geography rules changed.

## Technical coverage

The focused tests execute the actual guide and FjordInterface in jsdom, including
both desktop and compact/touch UI branches. They cover story handoff, invitation
and opt-out, the existing full Character Card, stocks/household navigation, the
Materials shortfall and real-production result, skip/collapse/Escape/replay,
Continue/import and unchanged-refresh persistence/focus.

Pure/headless checks cover seeds 0–19 (cattle, goats, pigs and sheep), actual costs,
existing suitable work and missing Materials work, out-of-order construction,
real-event-only completion, unavailable targets, bounded metadata, atomic import,
matching sidecars and same-founders/new-history reset. Paired runs assert exact
canonical serialization at matched commands/ticks, including events and RNG.

Targeted checkpoints: 42 initial checks passed; after the clock/surface fixes,
30 current focused checks passed with zero failures/skips. The complete female-hair
suite also passed after the byte-preserving Windows repair below.

Executed commands:

- `node --test tests/first-steps.test.mjs tests/first-steps-dom.test.mjs tests/campaign-start-dom.test.mjs tests/shared-settlement.test.mjs tests/island-loading-lifecycle.test.mjs`
- `node --test tests/female-hair.test.mjs` (with first-steps tests during verification)
- `pnpm run build` (TypeScript + Vite; existing chunk-size warning only)
- `node scripts/validate-public-assets.mjs --tracked`: 602 public files, 47 Terrain GLBs, 14 prepared islands, 56 exact character sources
- `node scripts/validate-characters.mjs --lab-previews`: 20 assets / 36 GLBs, 12 Golden, 19 equipped modules, Idle/Walk/Run + World
- `git diff --check`; no configured formatter was found, so source formatting was reviewed manually

The first full local suite before the final clock/surface fixes ran 1,317 tests:
1,306 passed, one Windows checkout-byte failure, and 10 existing optional source-
asset skips. It is retained as diagnostic evidence, not claimed as a successful
final-head full run. A new complete local run and exact-head GitHub CI are required
for the submitted revision; consult the PR checks/result for their final outcomes.

## Evidence limits / owner acceptance still open

- Browser automation was attempted against the real preview. The in-app browser
  was unavailable; the enabled-surface inventory contained no browsers/apps.
- No actual WebGL browser flow, screenshot or screen recording is claimed.
- jsdom exercises real DOM behavior, not pixel layout, physical touch, renderer
  startup/performance, orientation or an iPhone browser.
- Owner visual approval, physical iPhone landscape/portrait checks and a short
  independent uncoached alpha playtest are **pending**. No testers were contacted
  or simulated; no comprehension/completion-rate claim is made.
- Keep the PR in draft while these acceptance checks remain open. No merge or
  Sites publication is part of this issue implementation.

Use the four questions in `docs/gameplay/FIRST-STEPS-V01.md` for the uncoached test;
record actual hesitation and the tester's next action, not just completion clicks.

## Windows-only baseline check repair

The first full local run found one inherited female-hair provenance failure:
Git `core.autocrlf=true` had converted `scripts/prepare-female-hair.mjs` to CRLF.
Its working-byte SHA-256 was `6fe76009905cc28b634f754a2d8abd6ce2e5df354da58f94ab85282a3b526ce9`;
the unchanged main blob and provenance both require
`cb8aa6af4311626c56befba617a2741bdc87dd2069d3fa55aee41c5d5803ca4a`.
A byte comparison proved the only difference was CRLF/LF. The worktree script was
restored to the exact committed LF bytes. No pipeline, asset, expected hash,
provenance record, test or Git configuration changed. The complete female-hair
suite then passed; the source remains absent from the PR diff.
