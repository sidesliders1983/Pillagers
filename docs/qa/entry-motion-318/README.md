# Desktop start background — production integration #318

The approved rendered treatment is part of the real FjordSide start/recovery screens. It uses the owner's preset in `src/fjord-play/entry-motion/EntryMotionPreset.ts` and the inward-feathered diagonal water mask. Settings → Animated background controls a browser-local presentation preference. It does not alter a campaign, simulation RNG, saves or playback.

Eligibility requires at least 1100 CSS px, a fine primary pointer with hover, and no reduced-motion request. Other devices and saved Off preferences use the existing CSS image without fetching the renderer, shader or mask. The static image is also the immediate loading/error fallback. One lazy WebGL quad is capped at 900,000 pixels, 1280 backing width and 30 draw updates per second. Hidden pages pause; returning resets elapsed accumulation. Campaign loading suspends/disposes this owner before importing the game. Entry navigation reattaches the existing decorative layer rather than retaining detached renderers.

The temporary A/B/C selector, live tuning controls and prototype route do not ship. The complete original experiment, raw measurements, capture and owner-selected tuning are preserved on [the archive branch](https://github.com/sidesliders1983/Pillagers/tree/codex/archive-entry-motion-prototype-318-v2/docs/qa/entry-motion-318). The production shader preserves the approved visual math; the runtime owner adds real preference, lifecycle and failure handling.

## Verification

The public start-menu/settings regression was observed red before implementation and green afterward in `tests/player-menu-entry.test.mjs`. It verifies that the presentation preference is retained without campaign writes or activation. Existing entry/recovery/session/clock tests remain applicable. Browser journeys cover actual WebGL, reload and static preference, reduced motion/coarse pointer, hidden/resume, context/asset failure, menu replacement and disposal before a campaign's public open callback. A real new campaign is also checked separately. Browser evidence is retained in the task's ignored D: QA directory; current checks and release identity are reported on PR #322.

Commands:

- `node --test tests/player-menu-entry.test.mjs tests/campaign-start-dom.test.mjs tests/loading-run-entry.test.mjs`
- `node scripts/validate-public-assets.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vite/bin/vite.js build`
- `node --test --test-concurrency=4 tests/*.test.mjs`

Public mask bytes, dimensions and SHA-256 are validated through `public/branding/fjordside/start/motion.json`; the mask can be reproduced with `node scripts/qa/prepare-entry-motion-mask.mjs` using the retained original under ignored Assets/. Its 130,648 bytes stay below the 150 KiB data budget. No original source PNG/model is included in the release.

Publication uses only a fresh main export and its successful, sealed Alpha package artifact, with both routes and exact build identity checked before deployment. The existing public audience is preserved.
