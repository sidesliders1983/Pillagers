# Cultural occasions #277: current validation

The owner corrected and extended the first draft: weddings cost **3 Food per actual
recorded attendee**, wedding/communal ceremonies require the actual campfire, ceremonies
must be visibly recognisable, and a real newly formed partnership offers an optional
**Confirm / Not enough resources / Not now** invitation. This section supersedes the
initial flat-price snapshot retained below; historical fixture bytes were preserved.

## Current behavior

- Eight wedding attendees cost 24 Food; seven cost 21. Attendance is not reduced to fit
  stocks. Storytelling/music and communal ceremonies remain 3 Food total.
- Wedding/communal quotes include normal fuel: 1 Material if prepaid fuel is empty,
  otherwise 0. The existing shared refuel operation buys 1,000 ticks, including at a
  lit/zero-fuel boundary, without advancing time or changing ordinary fire commands.
  Ignition and Food spending commit atomically; failed/stale quotes spend neither.
- Exact old flat-price receipts remain historical facts and harmless retries. A genuine
  frozen d43fff save tests this compatibility; old history is not repriced or charged again.
- The non-modal invitation retains unresolved actual partnership sources with a saved
  presentation cursor, separately from generic Attention read status. Dismissal resolves only
  that question; relationships, Core resources and clock intent remain unchanged. Reading the
  partnership while another flow defers the window cannot silently decline it. Pending
  questions survive reload; real receipts/expiry remove them. No-pending refreshes stay cheap.
  Existing accepted commit → scene sync → fresh presentation ownership is reused.
  A newly confirmed wedding/communal ceremony brings the camera to its actual campfire;
  declined, failed and already accepted retries do not redirect it.
- One temporary merged mesh supplies the wedding arch/garland/standards or neutral communal
  standards/garland. The actual partners receive Wedding name markers. Static decoration
  remains visible when paused; suspension, hidden view, fire-off and completion hide it.
  No additional model, texture, actor, light, shadow map or frame loop is added.
- The actual prepared-island review exposed short-waypoint passing around settled attendees.
  The small ceremony/retained-return correction retains every physical terrain/collision
  check and existing route budgets. Ordinary passing behavior remains unchanged.

## Latest owner review: running and occupation tools

The garland was accepted. Residents now use the actual native Running gait toward the fire;
occupation tools/grips are hidden during the active presentation and restored afterward,
without outfit refits or Core changes. The final combined run passed **80/80**, zero skips,
and production build/typecheck passed. The unchanged-Core/adapter verifier still passes.
The prior874a5f6 full GitHub checks both succeeded; this new head needs its own checks.
[Participation qualification](participation-v4/README.md) preserves exact source/input hashes,
four actual navigation cases and CPU-only preparation evidence. New physical review is pending.

## Latest missing-invitation repair

The normal V2 regression failed before the fix: reading the actual partnership in the
Attention view while the invitation was deferred permanently suppressed the unanswered
question. With independent saved presentation decisions, all **13 invitation tests** pass.
A related campaign/Attention/Core/view/first-steps invocation passed **92/92**; root independently
ran the invitation and Fjord bridge suites, **29/29**, zero skips. These runs overlap. The
final production build and typecheck passed with 462 modules through the ordinary public-asset
pipeline. No required check was skipped or weakened. Current-head full GitHub CI remains its
own gate; these focused runs are not a claim that the whole repository suite passed.

The adapter compatibility verifier confirms both original V2 file/Core hashes, the unchanged
actual +1 Year result, pending delivery after history reading and reload, and exact full-history
Core parity after the 24 Food + 1 Material command. All frozen Simulation Core source hashes
remain unchanged. Historical V2 source pinning is retained separately below.

## Earlier revised verification

Before the later invitation-delivery repair, the combined functional invocation passed
**117/117**, zero skips: prices/fire,
current and historical receipts, actual Core replay, contextual DOM, automatic invitation,
actual prepared-island walking and return, native motion/audio lifecycle and factual history.
A separate broader history/family/narrative/ordinary-passing invocation passed **92/92**,
zero skips. These invocations overlap and are not claimed as 209 unique tests or a full
repository suite. A subsequent communal rear-plane geometry refinement passed all **9**
public visual/lifecycle/budget tests and TypeScript; the subsequent final production build also passed.

The ordinary asset/build pipeline passed with 621 public files, 14 prepared islands and
56 prepared character sources. Existing large-chunk warnings remain warnings. No validation
was bypassed. There is no formatter configured; manual formatting review and diff checks
are used. Full current-head GitHub checks are required again after this revision; earlier green
jobs validate their own snapshots and do not replace the new-head gate.

[Normal-rule fixtures](review-fixture-v2/README.md) retain the ordered seed search, genuine
unread partnership, exact ordinary commands and resource trade-off. The first affordable
checkpoint has 24 Food/5 Materials and confirmation leaves 0/4. A separate exact existing
+1 Year action from the pre-source checkpoint yields 38/5, so confirmation leaves 14/4.
Both use actual new PartnershipFormed event-28, never altered probabilities or stock grants.
The source/asset/artifact verifier, exact replay and actual SharedSettlement imports passed.
Historical Git/helper identities remain provenance, not a requirement to keep the repository
at an old commit when the exact normalized dependency bytes are unchanged.

[Navigation qualification](approach-qualification/report.md) preserves the initial failed
cases. The earlier Walking qualification had Low6/Standard8 gather with both partners at 24.5 seconds, finish the response
at 31.5 and physically return every staged resident by 55.1. Zero overlaps, retained-route
cleanup and unchanged Core are checked. With the ordinary clock advancing for 60 seconds,
both presentation paths retain exact Core parity with matched headless references.
These are bounded headless cases using measured native gait, not rendered browser or
physical-device timing. The decoration adds one active mesh/material, 840 or 616 triangles;
no GPU/frame or sustained device-memory result is inferred from those counts.

Focused current reproduction:

    node --max-old-space-size=1024 --test tests/cultural-occasions.test.mjs tests/wedding-invitation.test.mjs tests/cultural-wedding-navigation.test.mjs tests/cultural-ceremony-visuals.test.mjs tests/cultural-occasions-history.test.mjs
    node docs/qa/cultural-occasions-277/invitation-delivery/verify.mjs --verify
    pnpm run build

## LAN review source freshness

The device review exposed stale Vite-transformed modules at port 5190: the review HTML
was current while cached FjordPlay and gathering modules predated the invitation and
per-attendee price. This was a server-side mismatch, not evidence that the new Core
charged a 3-Food wedding. The broad **/scratch/** watcher exclusion also matched the
worktree's parent folder. Development exclusions now resolve only below the actual
project root (tools, scratch and artifacts), so a worktree inside scratch remains watched.
Restart the review server after this correction and verify served source maps against
the working files, including FjordPlay, the gathering quote and Core, before device review.

The original V2 source verifier includes the two presentation adapters now changed for
independent invitation persistence. Its pinned search/checkpoints remain historical evidence
at commit 1bb927d, not a current-adapter pass claim. The separate
[adapter compatibility qualification](invitation-delivery/README.md) verifies unchanged Core,
original checkpoint bytes, exact canonical outcomes and the new presentation adapter.

## Remaining delivery gates

Port 5190 serves this revised review. Accepted port 5180 remains the first #275/#276 build.
The computer-use inventory exposed no browser, explicit in-app browser creation returned
unavailable, and opening the page in Codex was queued. HTTP/DOM/headless checks are not
rendered layout, listening or physical-device acceptance. Review the actual new invitation,
ceremony appearance and pair labels on a device before acceptance. First-prototype UAT does
not automatically approve these later changes. Keep the PR draft while exact-head checks or
that review remain open. No merge, ordinary default activation or Sites release is included.

#278 still needs its open aid-policy decisions; #279/#280 keep their explicit prerequisite
gates. This #277 work does not declare the epic complete.

---

## Historical initial implementation at d43fff1

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
