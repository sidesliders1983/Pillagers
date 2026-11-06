# Clear island arrival — PR #326 follow-up

The owner’s 2 November recording showed loading progress, Back to start menu
and the founding reader over the island flyover, followed by a separate reader
before the guidance invitation. This revision changes that presentation order.

Preparation retains its existing cancellation, progress and optional founding
reader. At camera arrival the temporary reader closes, progress/copy/Back/Retry
are hidden, and only Skip camera arrival remains in the loading overlay. The
opening chapter remains in the saved Clan Book. After successful arrival the
existing Guide me / Explore on my own choice appears directly. Continue/import
retain their existing paused, closed-guide policy.

The loading owner still fences input until handoff. Focus moves off hidden
controls to that owner; cancellation/failure restore loading controls. The camera,
fog, far-plane cleanup, reduced motion and paused-clock policy are unchanged.

## Verification

- TDD: the new public arrival-lifecycle regression failed on the original code,
  then passed with story closure, release no-op, focus and inert cleanup verified.
- 39/39 relevant loading, First Steps DOM, entry and playback tests pass with
  zero skips or failures. The final test edit removed one extra blank line only.
- Production asset validation, TypeScript and Vite build pass. The existing
  bundle-size advisory remains. Formatting was reviewed manually and Git
  whitespace validation passes; no formatter is configured.
- Native Chrome with its sandbox retained and no rendering override completed
  focused arrival journeys at 1440×900, touch 844×390 and touch 390×844.
  The final runner observed 87/88/88 actual camera-arrival frames, respectively,
  with no unwanted loading UI, no page errors and exact initial/final Core parity.
- Skip retains a visible 44px target and reachable centre; both invitation
  buttons have reachable centres. Desktop chose Guide me, mobile chose Explore;
  neither choice started time. Source hashes stayed unchanged within each run
  and match the committed implementation and runner bytes.
- Actual mobile-landscape and portrait arrival/invitation screenshots were
  visually inspected. The desktop pair was inspected by the QA agent. This is
  focused loading-overlay/handoff evidence, not a repeat of the full tour or
  an acceptance test of distant terrain rendering.

Run with `node scripts/qa/check-anchored-basics.mjs desktop|touch|portrait --arrival-only`.
The ordinary desktop/touch runner also now follows the direct invitation;
it no longer waits for or closes the removed post-arrival reader.

[Evidence manifest](evidence-manifest.json) contains source provenance and SHA256
checksums. Raw JSON reports and the production-build log are losslessly gzipped;
WebP screenshots are compressed derivatives of retained local PNG originals.
The first desktop attempt used an earlier runner revision and is retained only
in ignored scratch; the three final-runner runs form the evidence here.

| View | Camera arrival | Direct invitation |
| --- | --- | --- |
| Desktop | [Arrival](evidence/desktop-arrival.webp) | [Choice](evidence/desktop-invitation.webp) |
| Mobile landscape | [Arrival](evidence/touch-arrival.webp) | [Choice](evidence/touch-invitation.webp) |
| Mobile portrait | [Arrival](evidence/portrait-arrival.webp) | [Choice](evidence/portrait-invitation.webp) |

The preceding [anchored-tour evidence](../anchored-tour/report.md) remains a
historical record of its source revision. Physical iPhone Safari and an uncoached
new-player test are not supplied by Chrome emulation. The PR remains draft;
new-head CI must complete before readiness. No merge or Sites release was requested.
