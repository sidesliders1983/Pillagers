# Cultural gathering audio audit — #274

Date: 2026-10-26. Audited source: `fb327996013b115bff985f7f87b7a69ff37eb24f`.
Status: design and source audit only. No new audio has been generated, accepted,
published or integrated by this audit; no runtime code or tests were changed.

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

## Credential, generation and evidence gate

The parent verified that the connected ElevenLabs tools do not offer SFX generation
here and that the current browser route is unavailable. No local API credential was
found in the inspected process/User/Machine environment or known project `.env`
locations. The owner has already been asked to configure the ignored worktree
`.env`; do not repeat that request or search unrelated credential stores.

After the parent confirms configuration, validate access using the local key without
printing it. Keep keys out of source, browser state, VITE variables, argv and reports.
Use the official endpoint and skill: `POST /v1/sound-generation`, documented at
https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert.
No purchases or unbounded rerolls. Record a fixed bounded generation plan and
exclusive creation journal; uncertain outcomes must be reconciled before retrying.

Retain model, prompt, parameters, returned request/generation IDs when available,
actual reported credit usage, original/prepared hashes, durations/channel counts,
peak/clipping measurements, tool versions and source/license evidence. Separate
technical preparation, listening acceptance and distribution clearance. Successful
generation or a green automated test does not prove audible quality, commercial
clearance, sustained physical-device performance or user acceptance.
