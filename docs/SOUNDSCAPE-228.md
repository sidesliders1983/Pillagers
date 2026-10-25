# Soundscape foundation — #228

The accepted first sound mix is now published with ordinary Fjord gameplay. See
[the publication record](qa/audio-publication-230/report.md). The historical proof
and measurements below remain a record of the foundation, not release acceptance.

This is the first implementation slice of #227. It is stacked on PR #262 at
`349f8d0645e142fb7a7f6372609aba4112bc29f6`, retaining its accepted sunlight defaults
and opt-in diagnostics. No Core/save format, geography, occupation or fauna rule changes.

## Current ownership

| Owner | Responsibility |
| --- | --- |
| `FjordEntry` | One application `FjordAudio` and one movable `AudioControls` view, shared through startup/retry/gameplay |
| `FjordAudio` | Explicit activation, one Web Audio context, master/three buses, bounded decoded cache and source ownership |
| `Soundscape` | Presentation-only real-second spacing, variants, priority, listener projection and finite audibility |
| `createFjordScene` | A disposable audio world, updated from its existing frame loop at most 5 Hz |
| `SoundPack` | Accepted published game manifest, explicit review variant and separate self-authored QA signal pack |

The failed attempt to allocate another complete checkout was rolled back by Git
when the workstation ran out of disk space. Work continues on a separate branch
in the existing clean checkout. Historical results and authoring assets were retained.

## Try the bounded proof

Open `/fjord-play?audioProof=1`. Choose **Sound → Enable sound** in the ordinary
start menu or game menu. The proof is explicitly labelled: quiet synthetic noise
plus intermittent short tones around the own settlement campfire. It contains no
recorded nature, animals, fire or chopping, and does not claim real actor activity.
Use a running campaign for the local tones; pause retains only a quieter noise bed.
Pan/orbit around the campfire, zoom out, use Map/Home, mute and background/return.
Check both phone speakers and headphones; the quiet balance still needs listening.

Ordinary URLs use the accepted nature/animal/village mix from committed public assets. Even with stored
unmuted intent, a fresh page requires explicit Enable sound. No unrelated camera
tap grants consent. Master, Ambience, World and Interface preferences live only
in `fjordside.audio.v1`, outside canonical campaign saves. Sound never advances time.

### iPhone silent-mode routing

The owner's first listening pass heard the proof on PC but not on iPhone. The
eight-second iPhone recording shows an active context (`Sound enabled`), nonzero
volume controls and the silent-mode bell icon. Its recorded audio is digital
silence; this supports a routing problem but does not establish the device output
or prove the root cause. The attachment SHA-256 is
`f03e0086d5afb61fc240ef8e9cddbcd192fea4f325514c34fe95857b4d7de60b`.

Safari's automatic Web Audio route can follow the ringer switch even with a running
context. After explicit Enable sound, the owner now requests the optional
`navigator.audioSession.type = 'playback'` before resuming. Unsupported or rejected
routing falls back to ordinary Web Audio. World replacement preserves the route;
application disposal restores the previous type if it still owns that setting.
Mute and hidden-page suspension still apply. No silent media loop, microphone,
extra context or background playback is introduced. Playback routing may interrupt
other media according to the browser's policy.

Reference: [WebKit's silent-ringer report and supported playback route](https://bugs.webkit.org/show_bug.cgi?id=237322#c6).
The correction still needs a physical iPhone listening pass with silent mode on.

## Listening and scheduling contract

The virtual listener is 1.7 m above the camera's terrain focus. Water/outside-land
focus uses at least the blueprint water level; invalid coordinates silence local
sources. Horizontal camera-to-focus direction defines screen-relative orientation.
Actual emitter height is retained, including elevated future bird sources.
Ordinary motion smooths over roughly 150 ms. A focus jump over 48 m re-anchors
immediately with a short master fade instead of travelling through unknown areas.

World cues fade linearly to zero at their declared finite range; zoom distance
above 40 m further reduces local detail. Local selection drops from eight slots
to four above 80 m and two above 160 m, with longer intervals for incidental calls.
Ambience and Interface bypass point
panners. Native equal-power panners provide direction, with custom finite gain
owning attenuation. This is artistic distance treatment, without physical occlusion,
reverb, Doppler or invented terrain blocking.

Only explicitly permitted sources enter selection. The QA sources use public own
campfire geography and the current visible discovery mask; no hidden Core/rival
lookup exists. Render visibility is not an audio eligibility flag. #230 must supply
its real actor/activity projection; this foundation does not add gull/animal/work AI.

Family cooldowns/jitter use presentation randomness. Clip selection avoids immediate
repeat. Stable loop variants and a small selection hysteresis avoid churn. A stable
optional action-event token cannot replay on refresh. Work contact offset metadata
is reserved for #230's actual animation contact integration, not implemented as
audio from yearly resource receipts. No missed sound queue exists.

## Bounds and lifecycle

- Selection at most 5 Hz, at most 128 eligible logical input records and 64 cue families.
- At most three ambience beds and eight other playing sources; at most four of one
  family. Two additional sources may fade for 200 ms. Beyond that allowance replacement
  stops immediately. Thus at most thirteen connected playback sources are retained.
- At most two file fetch/decode operations. Encoded files are streamed with a 4 MiB cap;
  at most eleven client callbacks may await those operations across world replacements.
  expected/actual PCM is limited to 8 MiB per file. The shared LRU cache retains at most
  32 buffers and 24 MiB PCM, protecting buffers used by playing/fading sources.
- PCM byte counts use actual decoded sample length × channels × four. They exclude
  native audio/codec/OS memory; concurrent decoding can transiently exceed retained-cache
  bytes. Native decode cannot be forcibly cancelled. Do not call this a total RAM bound.
- Local preparation paths use the game's base path. Missing/invalid files fail locally.
  No runtime provider URL, credential, generation, purchase or upload path exists.
- Pause fades world sounds and suppresses new calls, retaining ambience at 40%.
  Explicit interface cues remain eligible while paused.
  Hide/BFCache/interruption stops sources and suspends audio. Return may resume only
  existing unmuted intent, subject to browser activation; it never resumes the game.
- World replacement/disposal fences delayed completions and clears its sources without
  closing the application context. Page teardown closes the context and clears the cache.

## Validation and remaining acceptance

```powershell
node --test tests/soundscape.test.mjs tests/fjord-audio.test.mjs tests/audio-controls.test.mjs
node scripts/qa/measure-soundscape.mjs docs/qa/soundscape-228/policy.json
pnpm run build
pnpm run validate:characters --lab-previews
pnpm test
```

Tests exercise actual public audio/policy/UI ownership and actual shared-campaign
commands/save-load. External Web Audio, network, DOM and time are controlled test
boundaries; native decoding/output and layout are not emulated evidence.
Thirty-five focused audio/entry/loading/lifecycle/quality tests passed, along with
TypeScript, tracked-public-asset and complete character/Lab-preview validation.
Formatting was reviewed manually and with `git diff --check`; no project formatter
is configured. The full suite runs in current-head CI; the workstation has only
about 120 MiB free, so another full local asset-writing suite was not started.
The [raw policy probe](qa/soundscape-228/policy.json) measures Node JS decisions with
128 synthetic inputs, not complete game frames, browser audio CPU or audible quality.
It remains historical evidence from before the iPhone routing correction; no
per-frame scheduling code changed in that correction.

No controllable browser was available during implementation. The owner heard the
proof on PC; loop boundaries, stereo/mono, background/interruption and successful
iPhone/iPad listening remain unverified. The current physical-device/frame-cost
gate stays under #151. Keep the PR
draft until its checks and first in-game owner listening review are recorded.

Stop at this foundation. #229 supplies reviewed Pixabay recordings and bounded
ElevenLabs Foley; acquisition is still blocked on the browser download route and the
paid-generation allowance check. No provider audio was generated, downloaded or put
into Git by this slice. #230 integrates real fire/fauna/work, the first mixed scene
and the twenty-minute listening pass before broader activation.

API references: [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices),
[context state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state),
[panner attenuation](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel).
