# Cultural occasions #277: validation record

This follow-up is based on `bbb018013e682b76288ae3a2a44c4bcaa7457b8d`, the first
#275/#276 prototype in draft PR #285. Its branch is `codex/cultural-occasions-277`.
The parent head's two GitHub validation jobs passed. This follow-up requires its
own exact-head CI; parent success is not evidence that the new head passed.

## Implemented contract

The owner chose only newly formed partnerships, within one canonical game year.
The exact interval is `[PartnershipFormed tick, tick + ticksPerWinter)`. Founding
partnerships are excluded. Both current real partners must be available and included
in the reviewed attendance. Sponsorship celebrates the existing relationship once;
it neither creates nor re-dates it. Declining carries no relationship penalty.

Communal ceremonies have no invented religious canon. All three occasions share
the same opt-in version-1 cultural transaction, actual 3 Food debit, 3–8 adult
eligibility, two-assessment cap and previously measured 25% exposure-only modifier.
No new rule coefficients, resource stocks, default activation or provider assets
were added. The first prototype calibration remains an unchanged historical record.
These contract tests establish equal cost/effect routing, not new population-balance
or gameplay-enjoyment evidence.

Chronicle and Personal History distinguish partners and guests. A delayed wedding
passage links to the actual partnership source. The full campaign save preserves
published Clan Book text, exact resource ledgers and the existing Family Tree.
Historical restore validates event-time facts without requiring an old couple to
remain alive/together now.

Wedding staging reserves both spouses before the Low six-actor cap. The actual
couple and at least one guest must physically arrive. Missing/dropped actors and
the existing 120-active-second approach limit abandon only presentation. No actor
teleports, new motion controller, mixer, sound family, light or frame owner were added.
Canonical payment and support never depend on decoration.

## Executed checks

- 77/77 final combined tests passed, zero skipped: Core transaction/occasions,
  desktop/touch contextual DOM, real walking/staging/return, native motion loading,
  audio admission and synchronous lifecycle suspension.
- 80/80 history/session regressions passed, zero skipped: Chronicle, Personal History,
  Family Tree, Clan Book, narrative continuity/time, Attention and cultural session
  persistence. These counts are separate invocations with some overlapping coverage;
  they are not advertised as 157 unique tests or a complete repository suite.
- Final TypeScript checking and production build passed with normal public asset
  validation: 621 public files, 14 prepared islands, 56 character sources. Existing
  large-bundle warnings remain warnings; validation was not weakened.
- The new presentation tests use real canonical partnerships, matching generated
  worlds and actual LivingWorldController navigation. The combined run also retains
  the existing production-seed-91 safe-return regression.
- No repository formatter is configured. Formatting was reviewed manually and
  `git diff --check` passed.

Reproduce the principal checks:

```text
node --max-old-space-size=1024 --test --test-concurrency=2 tests/cultural-events.test.mjs tests/cultural-occasions.test.mjs tests/cultural-gathering-view.test.mjs tests/cultural-presentation.test.mjs tests/cultural-gathering-navigation.test.mjs tests/cultural-wedding-presentation.test.mjs tests/cultural-sounds.test.mjs tests/cultural-motion.test.mjs tests/cultural-audio-budget.test.mjs
node --max-old-space-size=1024 --test --test-concurrency=2 tests/chronicle.test.mjs tests/personal-history.test.mjs tests/family-tree.test.mjs tests/clan-book.test.mjs tests/narrative-continuity.test.mjs tests/narrative-time.test.mjs tests/attention.test.mjs tests/cultural-history.test.mjs tests/cultural-occasions-history.test.mjs tests/cultural-occasions-session.test.mjs tests/cultural-session.test.mjs
pnpm run build
```

## Real-rule review fixture

[The review fixture](review-fixture.md) documents a bounded, ordered search and
its actual commands. Seed 1 had no valid wedding within the bounded search; seed 2
produced a genuine new partnership at Winter 801/tick 0 with 4 Food remaining.
No rule override, free stock, fabricated event or forced outcome was used.
The paused full campaign imports through the ordinary game menu.

Use the fixture runner's portable source/asset manifest and replay instructions.
Its source hashes explicitly distinguish CRLF-to-LF-normalized text from raw host
bytes; the initial provisional search evidence remains preserved.

## Open review gates

LAN port 5190 serves this follow-up; accepted port 5180 still serves #285. HTTP 200
was verified on localhost and LAN for the review and campaign JSON. The computer-use
inventory returned no enabled browsers; opening the review in Codex was queued.
No rendered browser, listening or physical-device check is claimed for #277.

The owner accepted the first storytelling prototype's device/listening flow, not
these new selectors and wedding staging. Review the new flow separately on a
physical device. DOM and headless navigation do not establish GPU/frame cost,
long-duration memory stability or the previous performance study's unresolved limits.

Keep the follow-up PR draft until required exact-head checks pass. No merge, ordinary
campaign activation or Sites deployment is included. #278 awaits its own unresolved
aid-rule decisions; #279/#280 retain their explicit prerequisites.
