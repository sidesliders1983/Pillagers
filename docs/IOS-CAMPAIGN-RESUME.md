# iOS campaign resume — issue #161

Returning to an existing campaign is separate from creating a new campaign. The owner approved
pausing on return on 2026-10-16. No elapsed wall time is converted into missed ticks.
An explicit 2D/3D ownership handoff retains the existing transfer contract and fractional pacing.

## Lifecycle policy

- Visibility hidden: pause, invalidate queued clock work, reset presentation delta, and write an
  automatic resume checkpoint. Visible: retain the same scene, camera, selection and paused clock.
- Cached page (`pagehide.persisted`): retain renderer, assets and UI; suspend frame work. On cached
  return, reset frame delta and leave playback paused. A page that deliberately transferred its
  campaign to another view is stale and reloads the current checkpoint once; an ordinary cached
  page does not force a reload.
- Cold restore: paint a styled shell, validate campaign/story metadata, prepare the pinned saved
  island in the existing generation worker, then reuse cooperative mesh, texture and GPU staging.
  The heading is **Returning to your settlement…**, with the saved year/season and seed. No fresh
  landing animation or new founding chapter is created. Existing complete terrain saves retain
  their saved blueprint; they do not opt into a new island generator.
- Graphics context loss: pause and expose recovery/export actions. After the browser restores the
  context, reuse the existing scene and staged GPU preparation. Do not regenerate terrain or Core.
  A failed recovery leaves a reload/export route rather than silently creating another campaign.

## Save safety

`pillagers.fjord-play.active.v1` remains the active tab checkpoint. A separate automatic
`fjordside.resume-checkpoint.v1` local-storage entry is written on suspension. It does not replace
manual local-save keys. If active storage is absent or damaged, available local saves are offered
explicitly; import, downloading damaged input and starting a new campaign are explicit choices.
Probing candidates and failed worker starts write nothing. A restored proposal is published to
active storage only after initialization succeeds. Invalid clocks/recipes fail before terrain work.

The shared checkpoint may additionally hold validated presentation settings (quality, effects and
camera). These are outside Core and the WorldBlueprint. Older checkpoints without these settings
retain their existing defaults. Existing raw campaign import, local save and ownership handoff
remain supported. There is no offline progression or gameplay-rule change.

`FjordCampaign` imports into an uninitialized presentation adapter when opening a known save;
it no longer generates a placeholder legacy landscape before importing the real geography.

## Local diagnostics

Open `/fjord-play?debugLifecycle=1`. Diagnostics are opt-in, bounded to 64 lifecycle events, and
include navigation type, visibility, persisted page transitions, context events, campaign/book
identity and clock. Long tasks are a bounded aggregate where the browser supports that entry type.
No telemetry is sent and no private browser/device identifiers are collected. Download diagnostics
from the game menu to inspect real-device returns. A cold navigation is not by itself proof that
iOS evicted a tab: use the recorded transition classification rather than inferring from appearance.

## Validation

Public seams approved by the owner: campaign/session restore and browser lifecycle. Public tests
cover asynchronous pinned-island restoration, exact Core/story/layout, damaged and missing storage,
invalid metadata, presentation settings, old saved terrain and deliberate ownership transfer.
Browser checks cover responsive cold restore, synthetic persisted page transitions, genuine WebGL
context loss/restoration, reload, recovery download, worker failure and retry. Native BFCache and
physical Safari observations are recorded separately in the review evidence; emulation is not a
physical-device result.

- `node --test tests/campaign-resume.test.mjs tests/shared-settlement.test.mjs`
- `node scripts/qa/check-campaign-resume.mjs`
- `node scripts/qa/check-campaign-recovery.mjs`
- `node scripts/qa/check-campaign-bfcache.mjs`
- `node scripts/qa/profile-campaign-resume.mjs`

See [review and current evidence](qa/campaign-resume/review.html).

## Browser references

- [MDN: pageshow and persisted-page return](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event)
- [MDN: WebGL context loss](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
- [Chrome: back/forward cache lifecycle](https://web.dev/articles/bfcache)
