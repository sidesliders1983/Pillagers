# Selected game audio publication

The owner reported that Sites showed Sound enabled but played nothing. Live
main df0611b39d977a407abed83458d6682d75d1da60 had an empty approved manifest;
the selected pig file returned 404. This was a missing release, not evidence
of a new iPhone routing failure.

## Released scope

The owner accepted the local selected mix and requested public Sites playback.
All sixteen prepared files from that mix are copied unchanged to public/game-assets/audio
(6,566,888 encoded bytes). Original MP3s, private generation receipts, account/Flow
links and the standalone audition stay out of the release. No extra generation,
Core/save change or new sound type is introduced.

The public release has its own catalogue and accepted/cleared statuses. The frozen
#229 source catalogue remains unchanged at SHA-256
895f6f5b3173898e073abbf9ec198b8f8c7d234a10b6755210f964eeb0dab7ba.
The original catalogue still fails the existing publication gate as uncleared.
Per-file source/creator, source and output hashes, recipes and official license
references accompany the new release. The game integrates the recordings with its
world and activity; it is not an isolated sound-sample library.

The owner confirmed keeping the retained Tomcat2 source as the lynx placeholder
because a closer recording was unavailable. The catalogue says exactly that and
does not claim a verified lynx/bobcat recording. AI labels for pig, wolf and fire
remain, as do the mixed birds in supplied spring/summer wind. Normal-winter/waves
length differences alone do not prove attribution failure; their notes remain.
Autumn wind, unselected fauna and axe-B remain outside this first release.

## Runtime and verification

Ordinary URLs select the published pack. Synthetic proof remains explicit through
audioProof=1, taking precedence over audioMix=1. The existing shared owner still
requires Enable sound; volume/mute/lifecycle behavior and bounded caches/voices
are unchanged. The settings now describe nearby activity instead of claiming that
no approved pack is installed.

Three regressions failed before the fixes: ordinary projected pig playback had no
voice, normal URL selection had no published mode, and settings claimed no pack.
All 28 focused audio/projector/lifecycle tests then passed. The game build validated
all public files, TypeScript and the production bundle. The normal public-asset
guard now also checks each WAV, acceptance/provenance and exact runtime manifest.
Preparation/recipe line endings are pinned to LF so existing receipt hashes remain
identical across Windows and CI. No previous validation was weakened.

Reproduce from the retained prepared directory using scripts/audio/publish.mjs.
The script checks the frozen catalogue hash and every selected WAV before writing.
Then run node scripts/audio/validate.mjs public/game-assets/audio/release.json --publication
and the usual pnpm build/tests. No private path is needed after the release files
are committed. The public Site must still be exported from fresh main, validated
for that exact commit and published through its supported source workflow.

Source license references: [Pixabay terms](https://pixabay.com/service/terms/),
[Pixabay summary](https://pixabay.com/service/license-summary/),
[ElevenLabs terms](https://elevenlabs.io/creative-terms). These are source records;
owner acceptance does not claim completed sustained stereo/mono or physical-device
performance testing. Historical performance evidence remains unchanged.

## Pre-publication checks

The ordinary production preview served /fjord-play as HTML and the pig WAV as
audio/wav (433,230 bytes), both HTTP 200, without the private review middleware.
The browser-control inventory was empty, so this pass does not claim a native
browser/audio listening check. The existing public-owner tests cover playback
selection, consent, missing/delayed files, lifecycle and exact Core/save parity.
The retained live source checkout was 221.21 MiB; the selected WAVs add 6.26 MiB,
within the unchanged 255 MiB publication budget. The final packager remains
authoritative for the freshly built main snapshot.

Formatting was checked manually and with git diff --check; no formatter is configured.
The production build passed all public-file checks, audio publication validation,
TypeScript and Vite. The inherited Three.js chunk-size warning remains.
