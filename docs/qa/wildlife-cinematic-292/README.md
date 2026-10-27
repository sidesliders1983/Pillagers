# Wildlife sighting camera — #292

Implemented on the owner-requested existing `codex/wedding-cinematic-288` branch / PR #291. The accepted #288 wedding remains a separate presentation owner; wildlife never restores the pre-cinematic view.

## Reproduce

```powershell
node scripts/prepare-wildlife-cinematic-review.mjs
node --test tests/camera-navigation-intent.test.mjs tests/camera-obstacles.test.mjs tests/wildlife-camera.test.mjs tests/wildlife-live-anchor.test.mjs tests/wildlife-focus.test.mjs tests/wildlife-cinematic-view.test.mjs tests/attention-toast.test.mjs tests/wildlife-book-dom.test.mjs
pnpm build
```

Serve the production build on LAN 5180. Copy this review directory to `dist/docs/qa/wildlife-cinematic-292` after building (Vite empties `dist`). Open `review.html` and import the supplied genuine checkpoint through the normal recovery UI. Preserve/export any personal campaign first.

## Actual fixture

Campaign seed 32, physical island seed 168, world `fjordside-island-v0.3e-r3:168:cffd7da8`. Actual paid Explore commands with founders 1 and 2 produced `event-9` at Winter 800, tick 15: `great-black-backed-gull:grounded:0`. The runner saves a legitimately known view of that same current instance; no wildlife is spawned, repositioned or frozen. Explicit QA-only 5000 initial Food and quiet demography provide a bounded review setup, not shipping rules. See `fixture-manifest.json`.

`historical-sighting.json` advances this same real campaign another 1000 ticks and uses an ordinary camera looking away. The original event remains factual; it cannot authorize a flight to its old coordinates or a substitute animal.

## Validation

- Broad targeted regression run: **315 passed, 0 failed, 0 skipped** across camera, touch, wildlife/marine, attention, cultural/wedding, audio, expedition/longship and quality tests.
- Final focused delta after the real-browser layout finding and visible-structure obstacle fix: **23 passed, 0 failed, 0 skipped**. These overlap the broad run and are not added as independent tests.
- Production public-asset validation, TypeScript and Vite build passed. The existing large-chunk advisory remains; no checks were weakened. No automatic formatter is configured; formatting and diff are reviewed manually.
- Real public-interface tests cover exact live identity/world/species, current native transformed bounds, actual whale surfacing/dive rejection, Core/save parity, notification metadata/navigation, first wheel/pan/rotate/touch/keys/Home/Escape handoff, reduced-motion no-spin, bounded following, partial arc, natural last-view completion, save capture and cleanup.
- Scene safety uses native terrain/water/near-plane/world bounds and a bounded local snapshot of currently rendered trees, rocks, boats and visible player/observed-rival structures. Hidden Core rival data is not queried.

The broad run preceded one additional obstacle case; its two-case focused run passed before the final 23-case delta. Head CI is authoritative for the full current suite. Historical #288 baseline reports remain unchanged.

Browser evidence and source/fixture hashes are recorded alongside this report. Desktop automation and a phone-sized browser viewport are **not physical iPhone/iPad approval**. Actual device gesture/performance acceptance remains an owner check.

## Browser review findings

The real desktop notification path, a safe partial orbit, natural last-view completion,
one native outward scroll gesture and Escape were exercised. The actual post-camera
canonical export is deeply equal to the live fixture (`47d28fde530c1387ccb6077b0fd7578f235dda8a9d6591541fd95c52aad118a1`): Winter 800/tick 15, 10 events, RNG 32. Ordinary attention read metadata is separate.

`desktop-orbit.gif` is a **sampled screen capture**: 27 genuine browser screenshots,
measured capture intervals, 14.756 seconds encoded, no generated frames/audio. It is
not a smoothness/FPS benchmark. Raw capture frames remain in local scratch; interval
metadata is in `recording-timing.json`. `landscape-live-orbit.png` uses an actual
844×390 browser viewport; its two buttons remain 44 px tall and its compact caption
is 89 px tall. This does not emulate physical touch hardware or Safari.

The browser caught legacy generic aside CSS stretching the caption; using a semantic
section keeps the new caption compact. The expedition toolbar stays explicitly
collapsed until the group shortcut is opened again. Its destination ring is hidden
only during camera playback and returns afterward. Overlapping UI/scene refreshes
could leave Play disabled; finishing tracked scene work now refreshes the existing
clock-control availability without changing playback intent.

A final **32-case integration run passed** (0 failed/skipped), including campaign
playback, notification DOM and camera/input tests. These overlap earlier runs.

The console also reported duplicate declarations in the existing `forest` material's
atmosphere shader during scene loading. Atmosphere/material code is unchanged in
#292; this is recorded as an existing rendering-path issue, not a clean graphics-log
claim. The first attempt to import a shared review checkpoint via the in-game menu
was correctly refused by that menu's narrower legacy import format and retained the
campaign. Use the documented start-menu recovery/import path for these checkpoints.

Final-build browser follow-up: Play is available during wildlife focus while the
campaign stays paused at tick 15; Escape removes the caption immediately. Importing
the historical checkpoint from the start menu restores Winter 801/tick 15. Selecting
its original `event-9` opens the exact gull history, displays “That animal is no longer
in view.” and leaves the complete camera matrix unchanged. See `browser.json` and
`historical-fallback.png`. No historical coordinates were used to fly the camera.
