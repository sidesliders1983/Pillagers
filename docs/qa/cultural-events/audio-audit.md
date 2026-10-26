# Cultural gathering audio audit — #274

Date: 2026-10-26. Audited source: `fb327996013b115bff985f7f87b7a69ff37eb24f`.
Status: eight connected ElevenLabs candidates completed and were downloaded with
explicit mechanism approval. A separate two-file experimental pack and bounded
public audio integration are now implemented after TDD seam approval. Listening
selection and general-release acceptance remain pending.

## Existing authority and constraints

`FjordAudio` owns one application audio context, consent, bus gains, voice lifecycle
and a bounded decoded cache. `FjordScene.ts:670–700` assembles the existing spatial
sources on the same scheduler. Reuse these owners; a sound callback never creates
Core facts, participants, costs, cohesion or another random draw.

Preserve the current limits in `Soundscape.ts:35–36` and `FjordAudio.ts:362–397`:
24 MiB decoded LRU, 32 buffers, two concurrent decodes, eight nearby local voices,
three ambience beds and two fading voices. Far cameras already reduce local voice
budgets. Do not add a cultural ambience layer outside those limits.

The selected nature, wildlife, livestock and fire sources remain unchanged. Existing
sound consent and iPhone playback routing remain authoritative. An extinguished
campfire must not acquire fire sound through a gathering.

## Two proposed ElevenLabs sources

These are generation prompts for review, not claims about existing recordings.
No intelligible dialogue, specific religious practice or invented participant is
licensed by this audio design.

| ID | Requested duration | Prompt |
| --- | ---: | --- |
| `culture-murmur` | 3 seconds | Quiet nonverbal group presence outdoors: three adults softly exchanging low indistinct murmurs and natural breaths. Dry close recording. No intelligible words, names, singing, instruments, cheering, applause, fire, wind or room echo. Gentle level, natural short ending. Three seconds. |
| `culture-applause` | 2 seconds | A small group of three adults gives a brief restrained response with a few soft hand claps outdoors. Individual hands, relaxed uneven timing, dry close recording, natural decay. No stadium crowd, cheering, voices, words, music, fire, wind or reverberation. Two seconds. |

Prepare mono 24 kHz PCM16 WAVs with short edge fades, no clipped samples and true
peak below -1 dBFS. Listening must reject intelligible words, unwanted backgrounds,
exaggerated crowd size, conspicuous repetition or stadium-style applause.

The proposed aggregate cultural decoded-buffer allowance is **2 MiB**. Five seconds
of mono float PCM at a 96 kHz AudioContext uses 1,920,000 bytes; this is a worked
example, **not a universal maximum context rate or a process-memory measurement**.
At 192 kHz the same duration uses 3,840,000 bytes and exceeds the allowance.

Implementation must check the actual AudioContext sample rate before requesting
cultural decodes and verify actual decoded `length * numberOfChannels * 4` afterward.
The existing `inspect()` reports aggregate decoded bytes, but does not currently
expose the context sample rate. Any necessary public diagnostic or admission hook
must be coordinated with the parent and performance agent. If the cultural pair
cannot fit the aggregate allowance at the actual rate, skip the cultural cue(s)
without changing gameplay; do not silently expand the cache or claim every browser
uses at most 96 kHz. The existing shared cache and voice limits still apply.

## One spatial presentation source

A narrow cultural sound projector should consume only the shared presentation
owner's current accepted gathering: immutable event identity, current real staged
participants, actual positions, visibility/availability and current presentation
phase. It should produce at most one group emitter on the world bus.

- Use a stable event-owned source ID and phase marker. Never emit per participant.
- Use a finite local range, restrained gain, non-looping cues and cue limit one.
- Play only when the legitimate group is currently staged and observable. No
  sound from historical-ledger restoration, ordinary Talk/Listen, merely selecting
  the campfire or opening the Clan Book.
- Remove current sources on completion, invalid attendance, pause/background or
  scene replacement. No extra frame loop, all-person scan or timer-based Core work.
- Prewarm best-effort only after accepted visible presentation, during approach.
  A missing/busy decode skips sound rather than delaying or replaying the event.

Two existing scheduler behaviours need explicit coverage before integration:

1. `Soundscape.ts:82` prunes one-shot markers when an emitter disappears. A
   cultural projector therefore needs bounded phase consumption belonging to the
   live presentation, so returning from offscreen/pause cannot replay applause.
   Reloading a historical event must not create a new live presentation.
2. `Soundscape.ts:120` consumes a marker before the asynchronous load can complete.
   `FjordAudio.ts:254` may defer a start when two decodes are already active. Do not
   catch up a missed cultural phase after a late load. Missing sound is preferable
   to repeated applause or a false event completion.

## Preserve the accepted release

Do not rewrite `release-001.json`, `recipes.json`, existing catalogues or historical
receipts. `scripts/audio/validate.mjs:14–15,67` checks the frozen recipe/preparer
hashes and exact equality of the accepted runtime manifest and publication files.

Use a separate cultural manifest/catalogue and `CulturalSoundPack.ts`. Compose it
with the existing selected pack only for the enabled cultural runtime when the
new sources and release gates are satisfied. Tiny static metadata does not decode
sound; actual audio remains lazy through the existing owner. A separate validator
must check the cultural files without weakening the accepted release validator.

Proposed audio-owned files, subject to interface confirmation:

- `src/audio/CulturalSounds.ts`
- `src/audio/CulturalSoundPack.ts`
- `scripts/audio/culture/generate.mjs`, `prepare.mjs`, `validate.mjs`
- Generation/preparation receipts and candidate catalogue
- Prepared public files only after the applicable acceptance and provenance gates
- A minimal parent-coordinated `FjordScene.ts` integration

## Connected generation route and evidence gate

Correction recorded 2026-10-26: the connected ElevenLabs general creative-flow
route supports SFX even though no tool name contains a sound-generation label.
The earlier missing-SFX conclusion was incomplete. No local API key or browser
route is needed for this trial; do not request or store a new key.

The current-turn model schema verified duration_seconds, prompt_influence and
loop. The model guide favours short, concrete, single-source prompts, so the
actual trial uses shorter wording than the initial design examples above.

One review flow was created: https://elevenlabs.io/app/flows/F7dgNnpBtAMHjzQAKgaW.
It holds the 3-second murmur and 2-second applause nodes with four default variations
each. The joint estimate was 220 credits; the eight successful starts reported
66.66 credits in total, below the 1000 existing-credit cap. No purchases or rerolls.
All eight generations subsequently completed successfully, with provider-reported
3-second/2-second durations and 66.66 credits total. Listening, local byte
inspection and acceptance remain unproven.

The exclusive journal is scratch/cultural-audio-274/generation-journal.json and
contains exact prompts, model, parameters, flow/node/session/generation handles.
Uncertain outcomes must be reconciled from those handles, never started again.
Signed media URLs remain transient and must not enter logs, receipts or source.

Retain original/prepared hashes, durations/channel counts, actual credit usage,
peak/clipping measurements, tool versions and source/license evidence. Separate
technical preparation, listening acceptance and distribution clearance. Successful
generation or a green automated check does not prove audible quality, commercial
clearance, sustained physical-device performance or user acceptance.

## Local delivery status

The completed provider results are retained in audio-generation-receipt.json, with
all eight exact flow/node/session/generation handles and no signed media URLs.
Automatic approval review rejected passing the signed storage links into the
local downloader as a credential-bearing transfer outside the managed proxy.
No workaround was attempted; the owned waiting downloader was stopped without
requesting any media. No local originals, prepared WAVs or runtime assets exist
from this trial yet. The owner subsequently approved these exact eight downloads
to D:/CodexSites/Pillagers/scratch/social-cultural-events-274/scratch/culture-audio/
with transient signed links kept out of Git and logs. A fresh downloader on that
exact path was still rejected before its first URL chunk was accepted: automatic
review distinguishes that consent from permission to transfer the signed link
into a terminal outside the managed network proxy. The downloader was stopped;
no alternate interpreter, proxy, file or download route was attempted. The parent
has the exact reviewer reason and is handling this narrower mechanism approval.
Returned media URLs can later be refreshed from the retained handles without
starting or paying for another generation.

## Resolved delivery and preparation

The owner then explicitly approved the exact signed-link/hidden-stdin/local-Node/
outside-managed-proxy mechanism (question call_cb05a2b78ec142099b6e2f19cca09fc2).
The same eight generations were downloaded successfully, without rerunning or
paying for generation, to the approved scratch/culture-audio/originals directory.
Originals total 465,028 bytes. No transient media URL is saved in these records.

The focused scripts/audio/culture/prepare.mjs uses a pinned local FFmpeg 7.1 tool
(imageio-ffmpeg 0.6.0, tools/cache/temp on D:). It validates source hashes, prepares
mono 24 kHz PCM16 with short fades and attenuation-only headroom, validates WAV
structure/frame counts and measures clipping, RMS, integrated loudness and true
peak. All eight candidates passed these technical checks: total 960,352 WAV
bytes, exact 3-second/2-second durations, zero clipped samples and true peaks
between -25 and -5.7 dBFS. Full per-file raw/prepared hashes and metrics are in
audio-preparation.json; the receipt preserves the earlier review history.

Four options per category remain private review candidates. The generated
CulturalSoundPack.candidate.ts contains only the first variation of each category
as a deterministic technical preview, not a listening selection. The first murmur
is -39.2 LUFS while another is -24.4 LUFS; levels alone do not establish quality,
wordlessness or the best choice. At that private-preparation stage no candidate was imported or copied to public
assets; the later separate experimental runtime pair is documented below. All eight loaded together would exceed the proposed
culture allowance at 96 kHz; an eventual selected pair must still pass admission
using the actual context rate and actual decoded-buffer lengths/channels.

Reproduce with FFMPEG_PATH pointing to a verified FFmpeg executable, then run
node scripts/audio/culture/prepare.mjs. Its fixed private staging input is
scratch/culture-audio and latest-prepared.json locates the current result. The
preparation fingerprint normalizes source line endings to LF explicitly.

## Implemented optional runtime audio

CulturalSounds consumes explicit fresh acceptance via start({id, sequence}) only.
A canonical sequence watermark and at most two consumed phase flags stay outside
the transient Soundscape emitter map. Pauses, hidden/offscreen returns, missing
actors, cold or late first observations and scene replacement cannot replay an
old phase. A current accepted group has one stable spatial source ID through its
gathering/response phases. Visible approach alone may request lazy preparation;
zero staged participants and unknown context rate produce no source or preload.
The model uses no Core/Lore access, extra frame loop or per-person voices.

CulturalSoundPack and withCulturalSoundPack(base) compose exactly two candidates
without changing the accepted sixteen-source release or its validators. The
experimental public pair is Uba21h6cTZNVaO7eM8P5 (murmur, -24.4LUFS) and
5wzWo0JLiRv62M3wBVzM (applause, -27.5LUFS), chosen for comparable technical
levels rather than inferred listening quality. Two WAVs total 240,088 bytes and
have separate provenance/catalogue/manifest under public/game-assets/audio/culture.
Other six variations and all source MP3s remain private scratch review material.
The public catalogue reports listening pending and general release not approved.

The existing FjordAudio owner now exposes each world sampleRate and ready(cueId).
An optional manifest decodedBudget names the two assets and a 2 MiB cap. It checks
actual context rate plus known cached actual bytes before fetch/decode, then
checks actual returned buffer lengths/channels before admitting either buffer
to the shared LRU. Unsupported family rates skip cues without a broken-file
warning. Existing 24 MiB/32-buffer/two-decode/global voice limits remain unchanged.
This bounds retained admitted buffers, not all native decoder/process overhead.

Eight new public tests and the existing audio regressions passed: 36 total, zero
failures/skips. The real prepared WAVs pass through the public owner in its
browser-API adapter tests, including consent, cache/world replacement and no
replay. Metadata-only and actual decoded-budget guards have distinct failing
regressions; a valid-container payload substitution is rejected by the separate
asset guard. TypeScript and manual source-format review/diffcheck passed; no
repository formatter is configured. Full commands, red/green evidence and source
hashes are retained in audio-runtime-validation.json. These checks do not claim
physical playback, listening acceptance, total device RAM or frame/GPU measurements.
