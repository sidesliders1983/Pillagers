# Desktop entry motion — throwaway prototype #318

Question: can the approved start artwork gain calm aurora/cloud movement and moving water reflections without loading the game world or moving the menu?

This is an isolated visual experiment, based on `codex/alpha-build-identity-320` at `ca057ac3b9232f7d5a19c2673cbdff215d09be1d`. It is not the production implementation of #318. The owner's current request explicitly includes water and clouds, extending the issue's original aurora-only scope.

## Run and compare

From this worktree, run `npm run prototype:entry-motion` (or `node scripts/qa/entry-motion-prototype-server.mjs`). Open:

- A: `http://127.0.0.1:5194/fjord-play?motionPrototype=318&variant=layered`
- B: `http://127.0.0.1:5194/fjord-play?motionPrototype=318&variant=rendered`
- C: `http://127.0.0.1:5194/fjord-play?motionPrototype=318&variant=static`

Use the arrow buttons/keys to compare. **Artwork only** hides the menu. **Settings → Enable animated background** changes an in-memory preference. **Preview entry exit** disposes the effect; returning creates a fresh owner. Choosing New arrival demonstrates this same exit, without creating a campaign. Load/Continue are disabled. No player save, Core, game clock, audio owner or browser preference is written.

A gently deforms the existing sky/cloud pixels and water highlights. B adds procedural aurora curtains, a moving cloud density field and matching rippled aurora light on the water. C is the unchanged static artwork. These are 2D shader treatments of the illustration, not a 3D fjord, volumetric clouds or physically correct reflection rendering. Source stars share the small image deformation. The approved menu layout stays the same across the visual variants.

## Asset and rendering boundaries

The original PNG files remain unchanged under the owner's ignored `Assets/Background-startgame` folder. The renderer reuses the already-published 2560px WebP; no second scenery texture is shipped. The full supplied PNG is a visual reference. The supplied transparent cutout contributes its alpha channel to a small three-channel sampling mask. Its composition differs slightly from the approved artwork, so conservative vector gates protect the actual mountain ridge, shore and foreground posts. These gates intentionally leave some boundary water/sky static.

Rebuild the mask with `node scripts/qa/prepare-entry-motion-mask.mjs "D:/CodexSites/Pillagers/Assets/Background-startgame/upscalemedia-transformed (3).png"`. The generated mask is committed so a fresh checkout runs without original authoring assets. Exact inputs, output hash, source hashes and byte counts are in `assets.json` alongside this report.

Only desktop ≥1100 CSS px with hover, a fine primary pointer and no reduced-motion request can create the renderer. One WebGL 1 quad, no Three.js/world/model imports, ≤900,000 backing pixels, width ≤1280 and ≤30 draw updates/s. The original CSS background stays visible during lazy loading and on any failure. The effect never gates menu use. Texture bitmaps close after upload; disposal releases textures, shader/program, buffer and context. Pause resets elapsed-time accumulation, so resuming has no catch-up burst.

The prototype route is behind `import.meta.env.DEV`. Ordinary `/fjord-play` and the production build retain the existing static entry. The production bundle was scanned for prototype names, mask URL and UI markers: none were emitted. No Sites release or default activation is part of this experiment.

## Executed checks

- Canonical build steps: public asset validation, `tsc --noEmit`, Vite production build. Passed; the existing >500 kB chunk advisory remains.
- Real Chrome 156.0.8078.74, Windows, ANGLE Intel HD Graphics 630 / D3D11. Desktop 1440×900, 1920×1080 and 2560×1080: one bounded canvas, no page errors and no world/model/audio requests.
- Phone 390×844, wide coarse-pointer 1366×900 and reduced-motion 1440×900: zero renderer/shader/mask requests and zero canvases. These are browser emulations, not physical-device reviews.
- Live reduced motion, resize below 1100, motion preference off, simulated entry exit, 12 variant switches, forced context loss and missing-mask request: correct disposal/static fallback, never more than one canvas and no page errors. Captured states are in `browser-observations.json`.
- A real headless tab switch did not change `document.hidden` in this Chrome instance. That attempt is retained in the observations and is not evidence of physical background-tab behavior. A separately labelled visibility emulation checks the handler; real desktop backgrounding remains a follow-up before production integration.
- No unit tests added for throwaway visual code. Source formatting reviewed manually; this project has no installed formatter for these files.

## Measurement interpretation

`performance.json` records matched 30-second samples after warm-up, one variant at a time on the same machine and viewport. A common rAF probe measures browser callback pacing; it is instrumentation, not part of the shipped prototype. GPU samples use nonblocking `EXT_disjoint_timer_query` around the effect draw approximately once per 30 draws; no disjoint samples were accepted. CPU p95 is synchronous WebGL submission, not GPU execution or total browser work. CDP task/script/layout deltas and long tasks are recorded separately. These are exploratory single-machine observations, not a broad hardware certification.

The first valid measurement used the pre-optimization shader and is retained in `performance-before-optimization.json`. It showed avoidable GPU work in scenery and the inactive sky/water branch. The final shader skips those regions. An intermediate duplicate-declaration compile failure produced static fallbacks; that discarded local attempt is not used as motion-performance evidence.

## Final 30-second observations

| Variant | Effect draws/s | CPU submission p95 | GPU draw p95 | GPU samples | rAF gap p95 | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | 0 | — | — | 0 | 16.8 ms | 0 |
| A · Living artwork | 26.0 | 0.2 ms | 0.62 ms | 26 | 16.9 ms | 0 |
| B · Rendered curtains | 26.0 | 0.2 ms | 1.44 ms | 26 | 16.9 ms | 0 |

All animated samples used 900,000 backing pixels; no rAF gaps exceeded 50 ms. Task duration over the sample was 0.38 s static, 0.87 s A, and 0.81 s B; these totals include browser/instrumentation work. The additional mask is 120,398 bytes (117.6 KiB); the sum of gzip-compressed prototype source files is 7807 bytes (a source-size observation, not a production bundle claim).

[Desktop capture](rendered.jpg) · [12-second recording](rendered.mp4). The recording is a separate visual capture, not a performance trace.

To repeat the timing probe with an already installed Playwright, set PLAYWRIGHT_MODULE to its absolute index.mjs path and CHROME_PATH to the browser executable, start the prototype server, then run node scripts/qa/measure-entry-motion-prototype.mjs. Raw timing samples are retained alongside the summary. No dependency download is needed.

## Provisional result and next decision

The experiment demonstrates the visual approach with one small canvas and no game-world startup. A preserves the original illustration most closely; B gives independently changing aurora light at a greater GPU cost. The static option costs no effect work. The owner's visual preference is still open; no treatment has been approved for general activation.

Before a production rewrite: select a treatment, add the real persistent motion preference and game-entry teardown, verify genuine background/foreground behavior, review mask boundaries in motion and test representative desktop hardware. Keep the static/reduced-motion route. This prototype is intentionally kept on its experimental branch, out of main.
