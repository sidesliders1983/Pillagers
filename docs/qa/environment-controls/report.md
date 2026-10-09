# Environment Lab controls

The advanced controls previously occupied most of a laptop viewport. The shared world body CSS also disabled page scrolling. Settings now starts collapsed, with world generation/sand studies, lighting studies and scenery/material controls inside. Camera, Lighting, Quality and Pause waves & wind remain directly accessible. Diagnostics & sources starts collapsed below the canvas.

Native details keeps the existing controls mounted: values, camera and preview survive a collapse. Scrolling is restored only for the Environment Lab page. The orbit canvas retains its own wheel zoom and touch gesture handling. Long diagnostic text wraps instead of widening the page.

## Public browser verification

Production preview at http://127.0.0.1:5193/environment-lab, native Edge on this development laptop, with viewport sizes 1366×768 and 390×844; mobile viewport emulation, not a physical mobile-device test. No new performance gate or renderer change.

The browser check failed against the initialized original UI because Settings was absent (red.txt). It passes against the revised UI: advanced controls initially hidden; basic controls visible; at least half the initial viewport devoted to the preview; keyboard Enter opens Settings; seed entry survives close/reopen; no horizontal overflow; wheel zoom changes the observed camera without moving the page; wheel outside the canvas scrolls the expanded page. Neither viewport raised a page error. See results.json for canvas bounds and observations.

| Viewport | Preview visible at opening | Closed | Expanded |
| --- | --- | --- | --- |
| 1366×768 | 499px (65.0%) | [Image](1366-collapsed.webp) | [Image](1366-expanded.webp) |
| 390×844 | 543px (64.3%) | [Image](390-collapsed.webp) | [Image](390-expanded.webp) |

Run with the external Playwright runtime and native Edge:

~~~sh
node scripts/qa/check-environment-controls.mjs
~~~

QA_ORIGIN defaults to http://127.0.0.1:5181; QA_OUTPUT defaults to scratch/environment-controls. Existing Lab QA tools now expand Settings through the visible summary before operating advanced controls; frozen historical builds without that disclosure remain supported. Historical visual and hardware reports are preserved.

Production build passed. The sand-study controls and normal generated-world flow also passed through the expanded settings. The existing fallback water pixel check passed for Night, all four low-sun presets and exact paused Day restoration (fallback-results.json).

Visible pine wind and water motion, plus exact pause for both, passed in the production browser (motion-results.json).

The source uses the repository's existing formatting style. No formatter is configured; changed markup/CSS and QA edits were reviewed manually, with git diff --check.
