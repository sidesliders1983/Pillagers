# Cultural events — implementation evidence and open gates

Status: active development, not a delivered or default-enabled mechanic.

## Authoritative starting point

- Epic: https://github.com/sidesliders1983/Pillagers/issues/274
- Clean branch: `codex/social-cultural-events-274`.
- Base: `fb327996013b115bff985f7f87b7a69ff37eb24f` (fresh main, 26 October 2026).
- Workspace: `D:/CodexSites/Pillagers/scratch/social-cultural-events-274`.
- Existing dirty root and other worktrees are preserved. Locked dependencies use pnpm 10 and the D: store.

The owner requested Core/gameplay, journey-based UI/UX, Meshy motion, ElevenLabs audio,
lighting/shaders and QA agents, then explicitly added a dedicated performance agent.
The roles are staged within the available concurrent-agent slots; they share this branch
with separate file ownership. Audits are evidence, not implementation acceptance.

## Required delivery order and retained scope

1. #275 and #276: one real sponsored storytelling/music gathering plus one measured,
   bounded consequence for actual adverse-weather exposure. Keep prototype-only until
   reviewed coefficients and a useful benefit are demonstrated.
2. #277: existing-partnership wedding celebration and neutral communal ceremony, using
   the same transaction/state. No marriage purchase or invented religion.
3. #278: rare real support after an actual recorded housing loss. No fake reconstruction,
   resource transfer, temporary housing or second caregiver engine.
4. #279 and #280 retain their explicit prerequisite/design gates. Do not invent defensive
   CPU attacks or newcomer loyalty mechanics to close them. Audit actual prerequisites
   before proposing any later implementation.

No automatic publication, default activation, merge or full-epic completion is established
by this working record. Existing published stories and historical measurement reports stay frozen.

## Findings from current code

- `SimulationCore.applyCommand` clones and validates state: sponsorship must be one atomic
  quoted transaction with a stable expected sequence and duplicate receipt semantics.
- `EventFacts` records real participant IDs/names/ages. Talk/Listen, sound, frame updates
  and animation callbacks must never select or invent attendees or award cohesion.
- `Weather` adds 50 basis points in Harsh and 200 in Severe weather for exposed residents;
  permanent shelter contributes zero. `Mortality` adds this to natural age risk using one roll.
- `Mechanics` resolves mortality against the outgoing saved weather before choosing new
  weather. `WorldExpeditions` also invokes mortality: settlement support must not become
  a mission-casualty or crew-return natural-mortality bonus.
- Weather shares the mechanics RNG. Paired multi-year strategies may diverge after a
  prevented death changes later draws. Report actual weather histories; never add an
  artificial weather stream to force identical results.
- Campfire selection already reaches `FjordInterface`/`SettlementPanel`. A compact in-card
  review can expose a genuine quote, available people, sponsor and cancel without a new HUD.
- The success-only UI command callback needs an explicit rejection/settled strategy so
  stale/insufficient-Food errors cannot strand a disabled sponsorship button.
- Native human sources share clips but actors own mixers/skeletons/materials. The existing
  extra-animation extension is eager: new culture clips must use a separate lazy bundle.
- Actor visibility does not currently establish CPU mixer culling. Never clone gathering actors.
- Existing audio ownership already bounds decoded buffers/voices/concurrency and supports
  consent, mute, scene replacement and backgrounding. Reuse it and one group emitter.
- Existing campfire light and snow warming/cooling follow actual fuel. Gathering presentation
  does not require another light or free ignition; the lighting role recommends preserving it.

## Owner-approved experimental prototype — not ordinary defaults

The owner accepted these experimental values on 26 October 2026: 3 Food, no Materials,
3–8 available adults, one prepared assessment
per accepted gathering, at most two banked. Each qualifying settlement mortality assessment
reduces only weather exposure by 25%, with an integer-floored reduction (50→38 and 200→150 bps).
Consume one contribution only with real exposed at-home residents in Harsh/Severe weather;
no offline or ordinary annual decay. Natural age risk, cattle, weather draws and shelter stay unchanged.

Three Food is 20% of the initial fifteen. This may be poor value; affordability, shortages,
prevented deaths and opportunity costs require real matched Core measurements. A coefficient
proposal or a staged gathering does not prove gameplay value or enjoyment.

## Current gates and evidence

- The owner confirmed all public TDD boundaries, including the later #277/#278 slices. Core, session, history, UI and presentation checks now run at those boundaries.
- Prototype coefficients were explicitly accepted as experimental values; ordinary default activation still requires measured benefit and review.
- Free authenticated Meshy balance/library reads succeeded. Two new prime motion tasks
  succeeded and their FBX outputs were downloaded and SHA-pinned (20 credits total).
  The exclusive journal is `scratch/culture-motion/journal.json`. Offline retargeting now
  produces a 445,676-byte native-rig candidate with zero meshes/images/skins and 480,480
  bytes of track arrays. All 46 native rest nodes/hierarchy are preserved. Exact palm
  contact and browser/device acceptance remain unverified. The separate lazy prototype bank now plays on existing resident mixers; it is not an eager default asset. Stable ignored
  source FBXs and tracked offline preparation preserve reproducibility without new calls.
- Existing mortality/weather/personality/resident-social baseline suites passed: 45 tests,
  zero failures or skips. Raw evidence: `scratch/culture-qa/baseline-tests.txt`. These
  baseline tests do not establish the new cultural mechanic.
- ElevenLabs SFX is available through the connected Creative Flow tools (verified after the
  owner selected the plugin). The initial name-based assumption that no SFX generator existed
  was incorrect. Model discovery confirms `eleven_text_to_sound_v2` with node type `sfx`.
  No separate API key is needed. Audio generation uses this connection and real receipts.
  CUA returned no browser; this no longer blocks provider generation.
- All eight existing ElevenLabs results were downloaded after the owner explicitly approved
  the signed-link/local-terminal mechanism. No regeneration occurred. Technical preparation
  produced mono 24 kHz PCM16 WAVs with exact 3/2-second durations, fades, no clipping and
  true peaks at or below -5.7 dBFS. A technically selected two-clip pair is wired to fresh prototype phases with a real 2 MiB decode-family cap; listening acceptance remains open.
- `.env` and `.env.elevenlabs.local` are ignored locally before credential setup. No secret is
  stored in this document, client code, public assets, URLs or command arguments.
- Browser/device rendering, listening, sustained performance and physical iPhone acceptance
  remain unverified. Existing tests/asset metadata are not substitutes for those measurements.

## Proposed presentation budgets — verify, do not claim as measured

- One visible gathering, reusing up to six existing actors on Low or eight on Standard;
  this is only a staging cap, never canonical historical attendance.
- Two shared lazy animation-only clips, zero meshes/images, no per-person source requests.
  Initial target: ≤1.5 MiB encoded and ≤512 KiB actual decoded track arrays.
- Zero additional lights, shadow maps, rendering passes, particle emitters or frame loops.
- One spatial world-bus emitter inside existing caps, no historical/load catch-up playback.
  Initial target: ≤2 MiB additional decoded audio measured at the actual context sample rate.
- Event/availability-driven destinations; no per-frame route generation or all-person pair scan.
- Compare the same save/camera/viewport/DPR/weather on baseline versus gathering, cold/warm,
  audio on/off and Low/Standard. A proposed ≤5% warm frame-p95 regression is a review target,
  not a result. Record unavailable metrics honestly.

## First playable path and completed calibration

- Explicit new campaigns with `?culture=1` enable the experimental path. Existing/imported campaigns retain their saved rules; the flag never upgrades a legacy save.
- Actual paid receipts feed the existing Chronicle, ambient Activity records, attendee histories and frozen Clan Book. Food cost reconciles in the factual ledger.
- Fresh accepted events stage at most six existing actors on Low or eight on Standard. Existing safe routes lead to the campfire; blocked actors skip decoration. Loading history never replays a performance.
- No cultural light, fire ignition, snow warming, character copy, mixer copy or extra frame loop is added.
- [Calibration](calibration-report.md) completed 6,000 single-boundary cases and 96 ten-year strategy campaigns. The risk effect is real; the complete-strategy uncertainty interval includes zero. Heavy spending had little additional use, so no coefficient or default was silently changed.
- Browser inventory was checked again on 26 October and still returned no browsers. In-game visual/listening/touch and sustained device acceptance remain pending.

## Owner prototype review, 26 October 2026

The owner accepted the requested mobile/device and listening review as working pleasantly.
The follow-up UI preference places the gathering below the existing campfire lighting controls.
This accepts the tested prototype flow; it does not activate ordinary campaign defaults or
provide instrumented frame/GPU/memory measurements. The separate two-file culture catalogue
records this acceptance without changing the sound bytes or the approved base release.
