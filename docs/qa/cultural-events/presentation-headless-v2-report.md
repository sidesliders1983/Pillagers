# Cultural presentation — headless navigation/performance evidence

Status: **v2 functional coverage passes, but a reproducible post-release CPU hitch
remains unresolved. This is not full FjordSide or device acceptance.**

## Scope and fixed protocol

The executed benchmark is `scripts/qa/measure-cultural-presentation.mjs`. Both
revisions use real prepared production islands, canonical Summer-800 campaigns,
real `SponsorGathering` commands costing 3 Food, the public Fjord projection,
`LivingWorldController` and `CulturalPresentation`. No render or model substitute
creates canonical facts. The Core is held at the paid snapshot during each
presentation cohort, and its serialized hash must remain unchanged.

Fixed campaign seeds **17, 32 and 91** map through the current pool to terrain
seeds **18, 168 and 15**. Each starts with ten projected residents and three
livestock. Each accepted event has eight canonical participants. Low and Standard
here mean **staging limits of six and eight existing actors only**, not renderer,
texture, water, shadow or DPR settings.

There are four paired repetitions per seed/profile, alternating baseline/staged
order. Both arms start from the same paid state, entity projection and exact
public actor-pose hash after five presentation seconds of common warmup. Baseline
marks the accepted event seen without staging; staged shows it. Cadence is 0.1
presentation seconds. V1 measures 45 seconds plus five post-disposal seconds;
v2 measures 130 seconds plus five post-disposal seconds to cover the corrected
bounded approach. The longer v2 window is a declared protocol revision, not
pooled with v1. Every completed revision contains 48 arms / 24 pairs.

The loader verifies exact prepared-island identities and the normal recipe. All
projected own-settlement entities participate in the controller. The normal
clan-specific discovery view bounds navigation. No seed or failed arrival was
removed. The harness uses the public controller's default pace; it does **not**
instantiate resident models or supply model-derived pace, occupation/graze clip
metadata, skinning, wardrobe, audio, WebGL or GPU work.

Per-step synchronous Node wall time covers `motion.advance` and `show.advance`.
Raw durations are retained as integer nanoseconds, with public navigation,
overlap, safety and actor inspections outside the timed span. Source hashes for
145 transitive TS inputs are captured before/after and required to match. A
quiet window was coordinated with the other agents; this is not an isolated
machine or physical frame-cadence measurement.

## V1 — timing was cheap, visual coverage failed

[Complete v1 raw evidence](presentation-headless-v1.json) retains the exact initial
45-second protocol and results. There were no paired update-p95 regressions above
5%, no body overlaps/out-of-zone observations and no added actors. However, every
physical-world approach reached the initial 30-second cutoff:

| Campaign seed | Terrain seed | Arrived at cutoff, Low / Standard | Result |
| --- | --- | --- | --- |
| 17 | 18 | 2 / 2 | Presentation continued with fewer than three actors |
| 32 | 168 | 1 / 1 | A lone actor could be shown as a gathering |
| 91 | 15 | 0 / 0 | Eight repeated arms never entered gathering/response |

"Naturally finished" in that raw schema means safely ended/released by the end
of the window; it does **not** mean an actual performance occurred. The favorable
p95 counters therefore did not establish functional acceptance.

The separate [public per-person travel diagnostic](presentation-v1-travel.json)
uses the exact seed-91 initial-pose hashes and keeps the controller walking
without imposing the coordinator cutoff. Low's first three arrivals occurred at
44.4, 48.1 and 57.6 seconds; all six arrived by 102.9 seconds. Standard's first
three arrived at 44.4, 48.1 and 61.8 seconds; seven arrived by 117.1 seconds, and
one had not arrived at the 120-second bound. At 30 seconds, actors had actually
walked about 15.3–17.2 metres. Routes/detours can substantially exceed straight
separation, so straight distance divided by nominal pace is not an adequate
arrival bound by itself. This diagnostic is not part of the timed cohort.

Root then changed the coordinator to require at least three actual arrivals and
allow a bounded 120-second approach. The exact v1 runner and all 145 matching
source files are preserved under
`scratch/perf-native-audit/presentation-v1-sources/`; its snapshot manifest verifies
completeness and the v1 runner hash. V1 remains evidence, not a discarded run.

## V2 — actual gathering coverage restored

[Complete v2 raw evidence](presentation-headless-v2.json) contains all 48 arms,
including per-step timings, public counters, hashes and protocol version 2.
All 24 staged arms entered gathering and response with **at least three actual
arrivals**, ended inside the 130-second observation window, and released the
cultural reservation without changing actor positions. All runs retained thirteen
logical actors, with zero observed body overlaps or out-of-zone actors at the
0.1-second inspection cadence. Core serialized hashes stayed unchanged.

| Profile | Median baseline run update-p95 | Median staged run update-p95 | Median paired change | Worst paired change |
| --- | ---: | ---: | ---: | ---: |
| Low: six staged | 0.3443 ms | 0.2599 ms | -25.36% | -9.56% |
| Standard: eight staged | 0.3403 ms | 0.2345 ms | -29.24% | +3.13% |

There were **zero** >5% paired update-p95 regressions in either the full fixed
window or its matched active-presentation prefix. These are logical-controller
measurements, not a claim of improved game FPS: staging temporarily replaces
some ordinary wandering with held gathering poses, changing navigation work.
Four repetitions / three fixed worlds are exploratory evidence, not broad
hardware or population coverage.

Startup work remains distinct from warm updates:

| Startup operation | Low | Standard |
| --- | ---: | ---: |
| Median synchronous accept/route burst | 7.63 ms | 12.31 ms |
| Accept p95 / maximum across twelve staged runs | 14.03 ms | 19.54 ms |
| Largest projection/controller setup sample | 6.90 ms | 4.71 ms |

There were 7–11 route attempts at event acceptance, below the existing four
candidate routes per selected actor bound. The maximum after-completion dispose
sample was 0.052 ms. That disposal timing is a completed-presentation cleanup
measurement, not an independent measurement of every active-cancellation or
renderer-resource lifecycle. The separate public lifecycle tests own those
behavioral cases.

The disk-backed prepared-world load plus Core/discovery fixture setup took about
0.8–0.9 seconds per seed outside measured arm updates. It is not a production
network, GPU or complete game-loading measurement. Neither the synchronous
accept bursts nor this setup should be extrapolated into an iPhone hitch budget.

## V2 unresolved tail: one actor, eight expensive failed work routes

P95 alone concealed an unfavorable deterministic tail. Campaign seed 91 / Low
staged produced a **116.21–135.41 ms** update in every repetition at the same
presentation instant: **84.6 seconds**, after the gathering had ended at 64.6
seconds. The next-largest sample across the matrix was about 16.88 ms. This was
preserved and reported before any fix; it was not excluded as an outlier.

The [public route-observer trace](presentation-v2-tail-trace.json) identifies what
happens at that step:

- Baseline: zero route attempts; `persona:founder-3` is already walking toward
  `shore:202`.
- Staged: the same single actor initiates **eight occupation route searches**,
  all rejected, visiting **16,002 nodes in one update** (about 2,000 per search).
- The burst is exactly twenty seconds after release. The current release path
  calls `cancelVisit`, whose existing work-delay reset is twenty seconds.
- All eight requests belong to **one actor**, so merely staggering different
  actors' restart delays would move this worker's burst rather than demonstrate
  that it has been eliminated.

The trace distinguishes benchmark step 846 from public controller step 896,
which includes the common five-second warmup. Its frame/route counts are
behavioral evidence; the trace was run outside the quiet timing window and is
not used as another CPU comparison. Root and motion were informed before any
proposed staggering change. The exact cause/appropriate bounded recovery needs
its own public regression test and a later frozen timing revision. No runtime
performance fix was made by this agent.

## Commands, limits and retained runner failures

Executed v2 command from the D: worktree:

```powershell
node --max-old-space-size=512 --expose-gc scripts/qa/measure-cultural-presentation.mjs
```

The current script writes compact machine JSON with a 1 MiB output cap and fixed
sample counts. V1 used the shorter 45-second protocol and its original runner is
preserved with its source snapshot. Running the current runner against later
runtime changes creates new evidence; it cannot silently reproduce an old
source revision.

Two early runner integration errors stopped before any timed arm: omitting the
explicit campaign seed in `createFjordLayout` for a differently seeded physical
island, and passing the canonical discovery container instead of its public
clan view. Their zero-arm records are retained as
`presentation-headless-initial-runner-error.json` and
`presentation-headless-discovery-runner-error.json`. A first v1 attempt completed
46 arms before pretty-printed raw arrays exceeded its 512 KiB output cap. That
partial record remains in scratch. Only JSON serialization was compacted before
the complete v1 rerun; seeds, timing, runtime and outcomes were not tuned.

These results contain no browser layout/rendering, native GPU, resident mixer,
actual sound decoding, total device RAM or physical iPhone/iPad measurement.
The compact default model textures remain unchanged. No runtime code, motion-
owned test, Core rule, balance coefficient or provider asset was edited by this
performance role. Passing headless p95 and functional checks does not establish
that the full game is ready while the reproducible tail remains unresolved.
