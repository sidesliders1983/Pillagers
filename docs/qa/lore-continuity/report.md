# Lore continuity validation · #104

Owner direction and conditional English wording were approved on 11 October 2026. [Twelve actual composed passages](runtime-review.html) are available for the final runtime wording review. These are recorded Core campaigns or explicitly configured Core QA fixtures, not the fictional scenes in the owner's document. [Approved direction](wording-review.html), [current implementation](../../lore/CLAN-BOOK-V02B.md).

## Reproducible campaign cohort

Command: `node scripts/qa/measure-lore-continuity.mjs`. Seeds 1–20, 50 Winters each; narrative seeds 1001–1020. Default rules include weather, human mortality and cattle lifecycle. Each campaign salvages its founding longship, then advances 50,000 ticks. The session closes all ten intermediate five-Winter chapters. An independent direct Core run applies the same two commands. No expeditions are dispatched in this cohort; expedition wording is covered separately below.

[Machine-readable results](cohort.json):

- 20/20 canonical Core saves exactly matched the direct Core run, including state, RNG, events and target clans.
- 20/20 saved books and canonical saves survived restore exactly.
- 220 published chapters, including twenty openings; zero exact duplicate whole chapter bodies in this cohort or within any measured book.
- 202 older callback references across chapters (not 202 globally unique events). No bounded fallback was needed in this cohort. A dedicated regression test forces an already-published candidate and verifies rejection without rewriting old prose.
- For the same factual campaign, 32 narrative seeds yielded 18 distinct opening bodies. Repeating a narrative seed repeated the opening. This is a finite variation bank, not universal uniqueness.
- After replacing standalone numeric tokens with `#`, 89 opening sentences and 203 ending sentences repeated a previously observed sentence across all 220 chapters. This measures repeated occurrences beyond the first occurrence, not pairwise similarity. The short controlled resource endings account for much of the cross-campaign overlap. A regression test separately checks that actual opening and ending wording avoids the previous two chapters for repeated work actions; distinct template IDs alone do not satisfy that test.
- Measured opening lengths: 66–88 words. Later chapters: 26–248 words, median 98. These are below the issue's exploratory ranges in many cases. The composer intentionally does not pad scarce source facts with invented journeys, emotions, objects or scenes. Quiet or empty-clan intervals can be brief.

Run durations are recorded as aggregate elapsed milliseconds per paired run. They are neither frame samples nor a device performance gate. The report does not claim GPU/FPS improvement.

## Public book/session regressions

The owner approved the stored Clan Book/shared-session and browser seams. Red-before-green regressions cover a construction recalled twenty Winters later, a changed name matched to its own birth despite duplicate display names, an occupation removal that must not become new work, foreign/future sources rejected atomically, frozen opening and initial planning memory, separate narrative RNG, recent wording avoidance, exact duplicate rejection, founder death/arrival, older shortage versus current accounting, a mission's own earlier departure and calves matched to their own mothers.

Unknown ritual/dialogue events remain raw-only. A deliberately edited old paragraph does not supply a mentor, forge or other facts to later prose. Existing published text remains frozen. Older callback IDs stay outside the current interval's accounting source set. Older ledger references are separately identified and cannot point to a future chapter.

Local checks: production build passed; character validation passed with Lab previews (20 assets / 36 GLBs). The full local suite passed 586 tests with zero failures and one existing explicitly conditional GLB-portability skip before the final wording refinements. The focused book/session/housing suite passed 32 tests; the final expedition wording also passed its public regression. The full suite is rerun by the required CI workflow on the final PR head before the PR is released. The conditional test skip is not a skipped workflow step caused by an earlier failure. No validation was weakened. The inherited Vite chunk-size warning remains advisory.

There is no configured formatter. Source layout and the diff were reviewed manually; `git diff --check` passed.

## Browser and LAN review

Command: `node scripts/qa/check-lore-continuity.mjs`. [Browser results](browser.json), [tablet appendix](tablet-reader.png), [checkpoint](chapter-tablet.png), [Fjord reader](fjord-reader.png).

- Edge touch emulation at 1024×768 and 390×844: the expanded appendix remained scrollable and dismissible. The small-screen reader leaves the actual HUD reachable.
- The inherited Close-button interception by the 2D HUD was reproduced before the layout fix. The reader now measures its HUD boundary and retains a sticky Close button; the fix did not require collapsing the appendix first.
- Five completed Winters produced the notification and actual named housing/longship paragraphs.
- 2D-to-Fjord handoff retained the exact opening and checkpoint text.
- The running Fjord clock advanced while the reader was open; refresh did not duplicate the notification.
- No page errors. These are touch-emulated checks, not a physical iPad Safari claim.

Both LAN review pages were checked at phone width: twelve approved conditional examples and twelve actual runtime passages. Every selected runtime paragraph matched its saved sample exactly; text is rendered with `textContent`. [Review screenshot](runtime-review-phone.png).

Recreate the twelve actual review passages after the cohort with `node scripts/qa/sample-lore-continuity.mjs`. The fixtures disclose their use of plain Core imports, observed checkpoints and configured mortality/fertility/stock values. Imported founding prose stays explicitly partial. The fixture narrative seed is saved as 7 before composing later checkpoints. Reopening the HTML review does not regenerate wording.

No gameplay defaults, Core/replay rules, runtime model, external service or download changed. Runtime wording remains available for the owner's review before merge.
