# Fjord performance evidence

The #166 audit, #168/#169/#170 improvements and touch-navigation investigation generated 311 evidence files. Reports, plans, canonical fixtures and selected summaries stay in the source tree. Bulky raw JSON captures, CPU/trace profiles, screenshots and console logs are archived in the original merged Git commit:

[`933deeaf13aa005a14564eaea4cc3c724981f446`](https://github.com/sidesliders1983/Pillagers/commit/933deeaf13aa005a14564eaea4cc3c724981f446)

| Report | Complete original evidence |
| --- | --- |
| [Runtime audit #166](fjord-runtime-performance/report.md) | [Pinned archive](https://github.com/sidesliders1983/Pillagers/tree/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-performance) |
| [Runtime improvements #168/#169/#170](fjord-runtime-improvements/report.md) | [Pinned archive](https://github.com/sidesliders1983/Pillagers/tree/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements) |
| [Touch-navigation regression](fjord-navigation-performance/report.md) | [Pinned archive](https://github.com/sidesliders1983/Pillagers/tree/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-navigation-performance) |

This is source-tree housekeeping. Historical measurements, failures, source pins, experimental rules and limitations retain their original meaning. Report links to archived files use that immutable commit. Embedded historical images load from the same pinned source. Git history and the merged PR's change statistics are not rewritten; this does not shrink an existing clone's Git object database.

## Restore and inspect

From the repository root, with Node.js, Git and the standard tar command installed:

```sh
node scripts/qa/restore-fjord-performance-evidence.mjs
```

This reads all 311 original files from Git, including the original reports and their relative links, into the ignored `artifacts/fjord-performance-evidence/` directory. Git archive uses LF explicitly so Windows checkout settings cannot alter historical text bytes. The helper refuses to overwrite an existing destination or write outside this repository's artifacts folder. Pass a different unused artifacts subdirectory as its first argument when needed. A shallow clone may need its earlier Git history fetched first.

Existing postprocessors can read the restored data. For example:

```sh
node scripts/qa/fjord-navigation-summary.mjs artifacts/fjord-performance-evidence/docs/qa/fjord-navigation-performance
```

Other summaries accept their evidence directory as an argument or through `QA_OUTPUT`; see the individual scripts. Run them against the restored tree to preserve the checked-in summaries. The original #166 evidence checker intentionally still reports its recorded inherited test failure; restoring an experiment does not reclassify it as accepted.

## New captures

Use an ignored output path such as `artifacts/fjord-performance-captures/` through the harness's `QA_OUTPUT` setting. Scoped ignore files also prevent raw captures accidentally returning to the historical documentation directories. Add only a concise report, a reproducible plan, required fixtures and useful small summaries to a future PR; large evidence can remain pinned to its own reviewed archival commit.

The game runtime does not load the archived evidence. The canonical fixtures used by QA and regression tests remain checked in at their existing paths.
