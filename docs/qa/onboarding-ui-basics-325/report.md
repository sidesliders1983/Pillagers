# Chapter 0 — UI Basics & Navigation (#325)

Status: implementation and technical review complete; final validation results below.
The required uncoached first-run test is pending. Keep the implementation PR in draft.
No merge, public release or Sites update is part of this change.

## Source and design decision

- Fresh main base: `01dc5f79c9b8ee4024c0fbed338af4778a5f4c97` (Three r180).
- Paused-entry fix: `3e17d3b8`, independently tested before the orientation work.
- Production source and reproducible browser runner: `e8c06cdf`.
- Branch: `codex/onboarding-ui-basics-325`.
- [Standalone prototype](https://github.com/sidesliders1983/Pillagers/blob/9a4dfa5/docs/qa/onboarding-ui-basics-325/orientation-flow.PROTOTYPE.html) and [journey/empathy hypotheses and verdict](https://github.com/sidesliders1983/Pillagers/blob/9a4dfa5/docs/qa/onboarding-ui-basics-325/prototype-verdict.md) are captured at `9a4dfa5` on the separate `codex/prototype-ui-basics-325` branch. They are not production code.
- [Implementation issue context](https://github.com/sidesliders1983/Pillagers/issues/325#issuecomment-6578986515).

The prototype asked whether six optional steps can retain clear progress when a
player acts out of order, skips, defers, revisits or completes orientation. The
journey/empathy maps are hypotheses, not observed player research. Parent-agent
native Chrome walkthroughs executed the four included scenarios at 1440×900 and
844×390: 31 included actions per viewport, with no page errors. This supports the
state design; it does not establish that a novice understands the game.

Chapter 0 reuses the existing small guide and actual panel, selection, map, menu
and time owners. All four chapters remain available. Acknowledgments are limited
to camera/time/interface explanations; resident close, connections and home use
real UI facts. Completion suggests Chapter I but does not select it or start time.
The current [gameplay contract](../../gameplay/FOUNDING-JOURNEY-V01.md) records the
six IDs and preserves the original 14 objectives.

## Agreed public seams and red/green coverage

The owner approved public Journey/First Steps progress and navigation, v1
migration, New/Restart/Continue/import, and Core/save/clock parity, plus desktop
and mobile-landscape browser checks.

Observed red/green slices covered:

- Both invitation choices stay paused; only the actual Play control records playback intent.
- A new history selects orientation while `newJourney()` and old version-one records keep their Home/Discovery/Conflict semantics.
- Bounded unique orientation IDs validate before import; invalid input leaves the active campaign unchanged.
- Real Character Card close/Escape, linked household/resident and living animal inspections count. Peek, collapse, unrelated links, unknown/dead animals and stale cards do not substitute.
- Existing menu, map, settlement and clock controls record presentation facts without issuing new Core commands. The late-created Map control is observed after its native owner, not in capture phase.
- Got it cannot forge resident/connection/home facts. It is idempotent and inactive guidance does not gain progress.
- All four chapters, skip/defer/revisit, explicit completion Continue and completed-lesson review remain available. Finishing an acknowledgment restores reading focus; guide key events do not reach world/recording shortcuts.
- Existing I–III predicates and canonical evidence remain unchanged. Continue/import preserve old selected chapter/objective and skip/defer history without reopening the invitation.

Independent final code review found and resolved the Map observation phase,
completed-lesson review and acknowledgment-focus issues. Final review found no
additional must-fix compatibility, state or lifecycle issue.

## Validation

| Check | Result |
| --- | --- |
| `pnpm run build` | Passed: public asset validation, TypeScript and Vite build |
| `pnpm run validate:public --tracked` | Passed: 640 files, 47 Terrain models, 14 prepared islands, 56 character sources |
| `pnpm run validate:characters --lab-previews` | Passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run + World |
| `pnpm test` | 1,663 tests: 1,653 passed, 0 failed/cancelled, 10 existing optional source-asset skips; 839.7 seconds |
| Focused guide/state/interface run before final review | 27/27 passed, with earlier pause, projection and legacy checks also green |
| Final Git whitespace check | Passed |

The ten inherited optional skips are nine source-Meshy/LOD checks whose original
source fixture is absent from this fresh runtime checkout, plus the opt-in portable
frozen-r3 export check (its existing `RUN_R3_EVIDENCE=1` flag is unset). No test,
required validation or assertion was disabled to obtain green.
The public runtime and explicit Lab character validation still run and pass.

No formatter is configured in the project. New/changed source was manually
reviewed for the existing style; `git diff --check` was used. Build retains the
existing large-chunk advisory. No dependencies, original source assets, Core
commands, gameplay balance or simulation implementation changed.

## Real browser journeys

| Run | Browser and viewport | Result |
| --- | --- | --- |
| Desktop | Native Chrome 156.0.8078.74, 1440×900, mouse/keyboard | 10/10 stages, zero page errors |
| Mobile landscape | Same native Chrome, 844×390, touch emulation, reduced motion | 10/10 stages, zero page errors |

Both final runs record production revision `e8c06cdf` and initial byte hashes of
all relevant source files and the runner. Evidence packaging verifies those hashes
against the unchanged source before archiving. The later evidence commit changes
only documentation/artifacts.

[Desktop Basics](evidence/desktop-basics-camera.webp) ·
[Desktop completion](evidence/desktop-basics-complete.webp) ·
[Mobile Basics](evidence/touch-basics-camera.webp) ·
[Mobile Character Card](evidence/touch-resident-card.webp) ·
[Mobile Map](evidence/touch-map-return.webp)

The runner uses installed native Google Chrome headlessly, with its sandbox
retained and no software renderer override. It creates isolated contexts and
random real campaigns through the actual New game UI; seeds and canonical hashes
are recorded in the raw results. It operates the real WebGL view and native
controls. It does not overwrite a user's campaign or use internal session commands
to complete orientation.

Each final run verifies these ten stages:

1. Actual New game and founding story lead to a paused invitation and Chapter 0.
2. Real camera input changes the view while canonical campaign data remains identical; keyboard Space activates Got it within the guide.
3. Show me opens a real full Character Card; closing it records the matching inspection.
4. The existing household link and View settlement return count without changing Core.
5. Show me focuses Play without activating it. Got it completes Basics at 6/6, still paused and on Chapter 0. Only explicit Continue selects Chapter I.
6. The tester deliberately presses the real Play control, observes simulation advance, then pauses it.
7. Reload/Continue remains paused, retains Chapter I and all six facts, and does not reopen guidance automatically.
8. In-game original-founding replay and Explore on my own remain paused.
9. A constructed legacy-v1 presentation import retains Chapter II, selected wildlife goal and existing deferred/skipped IDs with identical canonical data.
10. A trusted click on the actual late-created Map button records the return/navigation fact after Map opens, retaining the old selected chapter and unchanged canonical data/knowledge.

The legacy fixture is deliberately constructed from an actual current campaign by
removing only the optional orientation field and setting valid old UI progress. It
is a compatibility fixture, not a historical save captured from an older release.
The raw result contains the original and final campaign envelopes for parity review.

On the 390-pixel-high landscape screen the small guide scrolls; controls below the
fold remain available in that card. Competing full cards/panels fold or hide the
guide. The actual Character Card and Map are visible and retain their own close
controls. This is responsive Chrome evidence, not physical Safari evidence.

An earlier touch run passed eight stages with no page errors, then its runner
attempted to use the mobile drawer while the real Load game menu was still open.
Chrome correctly rejected the intercepted click. The runner was corrected to close
that existing menu through its actual close control; no force-click or production
workaround was added. The failed run is preserved and classified as a runner
navigation omission, not counted as completed coverage.

## Evidence files and reproduction

See `evidence-manifest.json` for original paths, SHA256 checksums, compression and
source provenance. Raw JSON/text are losslessly gzip-compressed and verified by
decompression; screenshots are compact WebP derivatives. Original PNGs and local
run directories remain under the ignored QA scratch directory.

From the feature checkout, start Vite on LAN with port 5195, then run:

```powershell
node scripts/qa/check-onboarding-ui-basics.mjs desktop
node scripts/qa/check-onboarding-ui-basics.mjs touch
```

The standalone runner expects Playwright through `PLAYWRIGHT_MODULE` (or the
existing workstation runtime path) and native Chrome through `QA_CHROME` (or the
installed default). `QA_ORIGIN` overrides localhost. `QA_OUTPUT` must name a new
run directory; existing paths are rejected. Each run records its Git revision and
initial source-file byte hashes before launching the browser. No new package or
browser binary is added to the game.

## Human acceptance still open

Issue #325 requires one uncoached new-player run. That is not replaced by agent
walkthroughs, integration tests or touch emulation. A request has been left for the
owner using the LAN build at `http://192.168.68.111:5195/fjord-play`; no result has
been received. A newcomer should independently look around, open/close a resident,
return to the settlement, then intentionally start/pause time. Record confusion or
blocked actions without coaching. Physical iPhone Safari is also not claimed by
the browser emulation. Keep the PR draft until required acceptance is recorded.
