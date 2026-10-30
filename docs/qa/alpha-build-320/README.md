# Alpha identity #320 — executed evidence

Application revision: **9d9d9c83303773ad47e9800da6b3aaa31d36a305**. Later changes
in this PR retain QA code, evidence and documentation; runtime application code is
unchanged. No merge, tag, release or Sites deployment was performed.

## Real numbered artifacts

- [Alpha package 1](https://github.com/sidesliders1983/Pillagers/actions/runs/41040333720),
  artifact 12969718223: branch push, actual source 9d9d9c83303773ad47e9800da6b3aaa31d36a305.
- [Alpha package 2](https://github.com/sidesliders1983/Pillagers/actions/runs/41040478274),
  artifact 12969538957: PR build, actual checked-out merge source ff96726cb943f9b1e5c11693b92a02e854981a7e.
  GitHub's run head_sha is the PR head; the embedded SHA correctly records the
  actual merge checkout instead. These are two real allocations, not sample IDs.

Both complete workflow jobs succeeded, including stamped compilation, artifact
sealing and upload. Both are explicitly **preview**, as required on a feature/PR
ref. A published-looking numbered alpha is reserved for a real subsequent main
packaging run; this issue does not merge to manufacture one. The first actual
sequence allocation is 1, not a historical renumbering. See [raw stamps, run IDs,
input/output hashes and GitHub ZIP digests](artifacts.json).

## Executed browser checks

[Raw result](result.json), Chrome 156.0.8078.74, headless with normal sandboxing.
Desktop 1440×900 and 1920×1080; portrait touch emulation 390×844, short landscape
844×390 and tablet 768×1024. This is browser emulation, **not physical Safari**.

- Real root and /fjord-play entries display the version below the wordmark,
  cool-white 14px text, no horizontal overflow and a primary action within the
  viewport. Five fresh and imported/returning layouts passed. Imports and reloads
  keep the same identity; no world/canvas/models/HDR or version-manifest request
  is introduced before campaign choice.
- Existing About/Help, [performance JSON](performance-entry.json) and
  [actual loaded-world loading JSON](loading.json) equal the original CI stamp.
  Loading a real campaign, navigating menus and exporting it preserve canonical
  campaign JSON byte-equivalent data and paused clock intent. Full save files
  remain in ignored local QA output, not duplicated in this evidence bundle.
- The server was switched from real artifact 1 to 2 while artifact 1 remained
  loaded. A newer server manifest did not change the loaded label. Navigation/
  reload then used artifact 2; further reload retained its own ID. No browser
  errors or HTTP failures occurred in the successful run.

Selected screenshots:

| Case | Screenshot |
| --- | --- |
| Build 1, desktop fresh | [image](ci1-desktop-fresh.jpg) |
| Build 1, desktop returning | [image](ci1-desktop-returning.jpg) |
| Build 1, phone fresh | [image](ci1-phone-fresh.jpg) |
| Build 1, phone returning | [image](ci1-phone-returning.jpg) |
| Build 1, short landscape | [image](ci1-short-landscape-fresh.jpg) |
| Build 1 loaded, server now build 2 | [image](old-loaded-build-new-server.jpg) |
| Build 2, desktop | [image](ci2-desktop.jpg) |
| Build 2, narrow viewport | [image](ci2-phone.jpg) |

The first longer browser attempt failed in the QA harness: it toggled a retained
Save panel closed before a second export, then its pending download promise timed
out. [Original failure](browser-attempt-1.txt) is preserved. The harness now
normalizes the existing menu state and awaits download/click together. No app fix
was needed; the complete repeated run passed.

## Unit/build validation and limits

The [focused run](targeted-final.txt) passed 23 tests, no failures/skips, covering
entry/menus, existing save/Core/clock behavior, loading/performance and packaging.
The final build-boundary run passed 10 tests. Red receipts show the missing label,
a real define-injection failure before its correction, missing-source fallback
and rejection of a substituted combined tag. Ordinary local build/assets/
TypeScript passed; inherited Vite large-chunk warnings remain. No formatter is
configured; new/edited code was manually reviewed and git diff --check passed.
The unit fixture uses synthetic workflow values only to exercise guards; shipped
browser evidence above uses the two real GitHub allocations.

Official clean-main labeling, retry/concurrency separation, unallocated/dirty/
unknown source behavior, exact output hashes and rejection of preview/stale/
changed metadata are tested at the agreed public packaging/build-info seams.
The current live Site remains main 752d5e1. Actual Sites promotion of an official
new main artifact is intentionally deferred until merge/publication is authorized;
the existing strict main guard is preserved. No interaction cache, Core rule,
canonical save/schema gate, browser counter or runtime GitHub request was added.

## Reproduce

Use Node 24, pnpm 10 and modern Git. Download the two named artifacts with the
GitHub artifact connector or `gh run download RUN --repo sidesliders1983/Pillagers --name fjordside-alpha-N-1 --dir DIRECTORY`.
Then set ALPHA_FIRST and ALPHA_SECOND to their extracted roots, optionally
PLAYWRIGHT_MODULE to the installed Playwright package, and run
`node scripts/qa/check-alpha-build-320.mjs`.
The script uses a private browser context, an ephemeral loopback server and
ignored bounded evidence output on D:. Large downloaded artifacts stay ignored.
