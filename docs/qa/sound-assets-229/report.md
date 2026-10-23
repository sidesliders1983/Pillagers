# Sound assets #229 — local candidate pack

This slice prepares actual owner-supplied audio and the first two custom axe
auditions. It does not activate production sound, publish isolated recordings,
or complete the listening/distribution gates of #229. Actual actor integration
and the sustained mixed-scene test remain #230.

Implementation branch: `codex/sound-assets-229`, stacked on the audio foundation
PR #264 at `4306d777d77f7c64b0471dde040b53c97add2186`. Existing unrelated work in
the primary checkout was preserved. The browser export supplies exact hashes
for the audio owner, policy, controls, audition and serving code used in its run.

## Frozen inputs and output

The owner updated the source directory during preparation. Earlier private
attempts remain under ignored `scratch/`; their measurements are not used as the
final pack. The current frozen snapshot contains 21 MP3 recordings, the owner's
trace workbook, two generated MP3s and their private generation receipt. Nothing
in the owner source directory was modified by these tools.

| Evidence | SHA-256 |
| --- | --- |
| Frozen source snapshot | `49af96f952b4ffc15522fd511961a20b22a269552d3c4a52be5605b7de529712` |
| Recording inputs | `c51a995c9e40551452300e937a1c1f052decac1c4402f556ec5abd943167e844` |
| Trace workbook | `72efa29295d6361c3796adf1e4347b6b9ec1698fb6d06772640cc4feab33c3d2` |
| Preparation script | `ff36d32eb406c42cd47880a1d7fdb5d4392afc8e96544e3a7052ee78ab1bed8a` |
| Recipes | `82e9438d8ca98aa4382fd02ac52c437b7e1e0acdc9168f6d1767ee9a199569e8` |
| Final catalogue bytes | `895f6f5b3173898e073abbf9ec198b8f8c7d234a10b6755210f964eeb0dab7ba` |

Private prepared directory, relative to this checkout:
`scratch/sound-assets-229/c51a995c9e40-82e9438d8ca9-ff36d32e-ca6596d3/`.
The [catalogue](catalogue.json) contains source/output hashes, exact edit filters,
encoded sizes, decoded estimates, measurements, source pages and separate status.
It contains no audio bytes, signed download URLs or account credentials.

There are **23 prepared candidates, five wind loops and eighteen one-shots**,
totalling **8,765,826 encoded bytes**. Twenty-two cue families share the existing
`SoundManifest`; the two axe candidates are real variants of one family. All
distribution/listening statuses remain pending or quarantined, not accepted.

## Preparation and measured limits

Delivery candidates are 24 kHz signed 16-bit PCM WAV. Point emitters are mono;
wind retains stereo. WAV avoids lossy encoder padding in the loop proof. These
files are derived from lossy MP3s, not restored lossless masters. Their encoded
total is larger than the original MP3 total; the choice prioritizes bounded PCM
and a first reliable browser decode/loop test over minimum download bytes.

The pipeline applies a 25 Hz high-pass for DC/subsonic content, explicit per-file
gain, short start/end fades and no speculative denoising. Axe attacks use a 2 ms
start fade, other one-shots 12 ms, with 35 ms tail fades. Wind loops use a 350 ms
equal-power crossfade into the opening segment. No provider file is overwritten.

Output sample peaks, true peaks, RMS, integrated LUFS, stereo mono-fold-down,
DC and boundary steps are recorded per file. Every prepared file has zero
clipped samples and more than 1 dB true-peak headroom. Short-call LUFS is recorded
with a caution and is not used as a shared normalization target. The two quiet
wind sources and quiet axe A receive individual gain; there is no blanket
loudness normalization of the set.

All files fit #228's 4 MiB encoded and 8 MiB per-file PCM bounds, including a
96 kHz context resample. The existing 24 MiB retained cache is unchanged. These
are buffer limits, not a claim about native decoder or total device memory.

The axe amplitude-onset estimates are about 0.54 ms (A) and 0.42 ms (B), with
absolute peaks at 74.71 ms and 20.54 ms. They are signal measurements, **not
verified animation contact markers**. Final contact timing and tail quality need
listening and #230's actual work animation.

## Intended use agreed with the owner

- Separate spring, autumn and summer wind candidates, plus normal and harsh
  winter wind. The owner replaced the earlier combined spring/autumn source.
- Wild animals: new sighting/contact only; no repeating ambient calls merely
  because an actor exists. Deer mating-call and angry-fox context need review.
- Cattle, goats, pigs, sheep, gulls and seals: occasional calls only while
  currently visible and permitted by player discovery, with restrained family
  intervals (mostly 35–90 real seconds). A single supplied recording does not
  pretend to provide several independent natural variants.
- Fire: occasional six-second texture only at a visible burning campfire,
  proposed interval 30–60 real seconds and 25 m cutoff.
- Shore: occasional ten-second texture near a known shore, proposed interval
  40–75 real seconds and 70 m cutoff. No all-island wave bed.

These are cue metadata and integration requirements. The audition uses explicit
Play buttons and does not implement or claim the actual gameplay triggers.
No Core, save, discovery, occupation, season or fauna rule is changed.

## Source review — holds rather than invented verification

The trace workbook was read without edits. Its latest frozen version covers
all 21 supplied files with creator attribution and individual Pixabay IDs.
The workbook was reread after the owner's confirmation that the missing entries
had been added. Its hash matches the frozen workbook above. Fox and both winter
winds are present, the wave/autumn IDs now differ, and no duplicate row remains.
Every ID was opened in a visible browser source page and the canonical URL,
title, displayed duration and explicit AI labels were recorded in
[`source-review.json`](../../../scripts/audio/source-review.json).
Absence of an AI label does not establish a field recording or exact species.

| Hold | Evidence |
| --- | --- |
| Spring and summer are mixed ambience | Source pages describe swallows/birds, reeds and insects. The owner approved keeping these supplied recordings on 23 October 2026. They are retained as mixed ambience. |
| Autumn source mapping | ID 34088 is **Sea Wave**, shown as 19 s; the local autumn file is about 10.7 s. |
| Normal winter source mapping | ID 499654 is shown as 13 s; the local file is about 19 s. |
| Wave source mapping | ID 376898 is shown as 22 s; the local file is about 19 s. |
| AI-labelled sources | Campfire, pig, elk, wolf and orca explicitly carry AI labels. The owner approved retaining the supplied campfire on 23 October 2026. This does not establish a real recording or accept the other fauna candidates. |
| Lynx identity | ID 41730 is **Tomcat2**, described as a domestic cat. |
| Elk identity | ID 390425 is **Bull**, with mixed cattle/moose tags and an AI label. |
| Marine call context | The whale source is an underwater song; orca call identity and above-water suitability are unverified. |

Duration discrepancies are review flags, not a conclusive binary-identity test.
No substitute species or recording has been silently selected. The owner has
been asked to resolve the remaining source mappings. Approval of the mixed wind
and campfire recordings is a creative choice, separate from listening acceptance
and publication clearance. The earlier captured source-review metadata remains
an audit of the source pages; this report records the subsequent owner choice.
All originals and candidates remain available locally.

General [Pixabay terms](https://pixabay.com/service/terms/) and the
[license summary](https://pixabay.com/service/license-summary/) were checked on
23 October 2026. Integrated creative use and standalone file/library distribution
are different. Trimming or conversion alone does not solve a distribution limit.
No candidate/original audio has been staged into Git, `public/`, Sites or a tunnel.
Final per-file acceptance and the runtime publication route remain open.

## First ElevenLabs pair

The owner explicitly authorized credit use. The paid Creator plan and available
included balance were checked in the owner's browser. SFX v2's effective schema
was inspected, then two 1.5-second, one-variation, non-looping nodes were created.
Both were estimated before generation. The initial hard cap was **200 credits**,
two requests/three requested seconds, one job at a time, with no retry or purchase.

Each estimate was 16.5 credits. Each completed connector receipt reports 4.9995
credits and 1.48 seconds; reported total **9.999 credits**. This is the connector's
usage record, not an independently reconciled account balance. The exact prompts,
parameters and IDs are in the [sanitized receipt](foley-receipt.json). No account
balance, workspace name, key or signed media URL is published. Generated bytes
are retained privately and never regenerated by preparation/build/tests.

[Sound Effects terms, Exhibit 4](https://elevenlabs.io/creative-terms) allow
integrated use subject to the paid plan and prohibit isolated sample/library
distribution. [Paid-plan commercial eligibility](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
was checked. No sharing or account setting was changed. Stop at these two initial
candidates until the owner listens. Light rain, a standalone leaf texture,
additional axe variants, tool handling and interface accents remain unavailable.

## Reproduce locally

Required private inputs are the frozen source files/workbook and the two retained
generated downloads/receipt. The repository intentionally contains only their
metadata, not a redistributable sample library. A fresh clone does not synthesize
or download missing audio automatically.

```powershell
# Set FFMPEG_PATH to an existing trusted FFmpeg executable when not on PATH.
node scripts/audio/snapshot.mjs "C:/CodexWorkspaces/Pillagers/Assets/SoundFX"
$audioInput = (Get-Content scratch/sound-assets-229/input.json | ConvertFrom-Json).output
python scripts/audio/read-trace.py "$audioInput/Sound-trace.xlsx" "$audioInput/trace.json"
node scripts/audio/prepare.mjs $audioInput
node scripts/audio/validate.mjs
node scripts/audio/serve.mjs
```

`read-trace.py` uses read-only openpyxl from the bundled workspace Python.
The preparation tool only writes under ignored `scratch/`, creates a new
hash-addressed output for changed inputs/recipes/provenance and checks that
sources did not change during the run. The validator checks WAV structure,
manifest completeness, file hashes, format, frame counts and limits. The
separate `--publication` gate currently **rejects** the quarantined pack; a
technical pass is not a completed delivery or permission to publish it.

The audition at **http://127.0.0.1:5198/** is loopback-only, with explicit Play,
Stop, volume and review-note export. It uses the real #228 owner/mixer/cache;
it has no provider call, upload, generation, general file-serving or LAN/tunnel
mode. Foreign Host requests were verified to return 403. Its version export
records the catalogue, bundle and runtime source hashes.

## Validation and remaining acceptance

Thirty-six focused audio/session/entry/lifecycle/quality tests pass, including
exact Core/RNG/geography save parity. A real browser load exposed an illegal
`Window.fetch` receiver that synthetic tones did not exercise; a public-owner
regression test failed first, then passed after binding the native fetch function.
No audio failure escapes into gameplay. Game and audition TypeScript checks pass.
The game production build and tracked-public validation pass. The existing large
Three.js chunk warning remains; no new dependency or rendering pipeline was added.
Character validation also passes, including explicit Lab previews: 20 assets,
36 GLBs, 12 Golden Characters and 19 equipped modules.
JSON formatting and manual code review were used with `git diff --check`; no
project formatter is configured. The full required suite is left to current-head
CI because of the workstation's limited free disk space.

Native desktop browser decoding/voice creation has passed for all 23 prepared
candidates. Raw browser observations and the source-hashed build export are kept
in [browser.json](browser.json) and [browser-controls.json](browser-controls.json).
A wind loop remained running with one voice after 97.354 seconds. Mute suspended
playback, unmute restored one voice, and Stop cleared playback. Maximum observed
retained PCM was 24,744,240 bytes, below the existing 24 MiB bound.
These checks establish decode/playback-node behavior and cache counts,
not human listening, accurate species identification or iPhone/Safari playback.
Loop boundaries, mono/headphones, actual volume/character, impact timing, first-pack
owner approval, selected-file source corrections and publication remain pending.

Keep the implementation in draft. No merge, public release or standard activation
is performed by this asset-production step.
