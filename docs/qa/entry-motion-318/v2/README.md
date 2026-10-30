# Follow-up: live tuning and softened water edge

The owner found the initial movement too faint and asked for live sliders. Eight controls now adjust aurora brightness/speed/sway, cloud drift/coverage, wave strength/speed and aurora reflection. Inputs update uniforms on the same canvas. Pause freezes the clock; changes while paused redraw one still frame. Reset restores the owner's selected preset. Share tuning produces a URL with the eight values, without browser or campaign storage.

The owner preferred this preset, then reported a sharp horizontal boundary below the houses:

| Control | Preferred value |
| --- | ---: |
| Aurora brightness | 1.1 |
| Aurora speed | 0.2 |
| Aurora sway | 1.75 |
| Cloud drift | 0.1 |
| Cloud coverage | 0.8 |
| Wave strength | 2.5 |
| Wave speed | 1 |
| Aurora reflection | 3 |

These are now the prototype defaults, also used by Reset. They do not activate motion in the shipping game. The source-art displacement is more visible than revision 1; B adds independently moving curtains and cloud shadows. This remains a 2D illustration treatment, with some baked-in source light; it is not a volumetric sky or physically simulated water.

The water mask now follows a slightly diagonal traced shoreline from the actual photograph instead of the shifted supplied cutout. Its alpha fades inward, and displacement, shading and reflected-light strength also ramp up with that fade. The 5–95% transition spans 19–20 pixels in the 1024×576 mask (about 35–40 px at the reviewed desktop width). The mask never extends outside the protected water boundary. The renderer also measures its actual fixed-layer rectangle so a vertical scrollbar does not misalign it with the CSS artwork.

## Review

Run `npm run prototype:entry-motion`, then open `/fjord-play?motionPrototype=318&variant=rendered&tune=1&revision=3` on port 5194. The owner's shared URL still works. Reload to fetch the updated mask. Tune motion opens the sliders; Artwork only hides them. Cloud coverage and added aurora reflection apply to B; A disables those two fields.

[Sliders](sliders.jpg) · [Motion capture](rendered.mp4).

## Executed checks

- Public browser journeys: eight slider values match the preset; live change preserves the canvas and phase; pause stops updates; changing a paused value renders a single frame; Reset restores all eight preferred values; sharing/restoring a modified value works; resume has no catch-up jump; variant switches retain values and C disposes the renderer. No page errors.
- Reduced-motion and phone emulations fetch no renderer, shader or mask and create no canvas. Actual mobile/device UAT is not claimed.
- Three-second image comparison at 1920×920: mountain, pier and village sample regions have exactly zero changed channels; sky and water sample regions change. Mask profiles show the diagonal feathered transition. Full states and sample boxes are in `browser-observations.json`.
- TypeScript and production build pass, retaining the existing large-chunk advisory. No prototype chunks or markers are emitted. The previous public asset validation is unchanged: this follow-up changes no public assets. Formatting was reviewed manually; no project formatter is installed.
- Two 30-second samples in Chrome 156 on Intel HD Graphics 630, one at the preferred values and one at all slider maxima: CPU draw-submission p95 0.2 ms in both, GPU draw p95 1.72 / 1.49 ms, no long tasks or rAF gaps over 50 ms. There were 27 non-disjoint GPU query samples per case. These are exploratory observations, not evidence that the maximum settings are faster. Current raw samples and source hashes are retained alongside this report.

The initial revision's reports remain in the parent directory and refer to commit `cdfd5f122ea6d9807f25d8dec7a10a588311f0e9`. They are historical evidence, not measurements of the updated shader. The owner's final visual review of the softened edge remains open; this branch stays a draft prototype.
