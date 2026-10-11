# Farmyard ground occlusion regression

Date: 2026-10-11. Route: /fjord-play. Seed 17. Edge with touch emulation.

The regional ground's slope-scaled polygon offset pulled transparent ground layers in front
of the authored Farmyard floor as the camera moved away. A downward-ray survey found the
sampled floor already above the flat terrain (minimum gap about 0.036m); lifting the source
asset or modifying stored terrain was unnecessary.

The shared generated-terrain renderer now uses fixed depth units to separate its coplanar
sand, rock and soil layers. The slope factor is zero. Geometry, source GLBs, masks, lighting,
Core state and saved world heights are unchanged. This applies to generated Fjordside,
Environment Lab and canonical /fjord-play, which share this terrain renderer.

## Browser rendering evidence

The regression first failed against the real source Farmyard and generated terrain in a
browser WebGL render target. Diagnostic materials retain actual masks, geometry and depth
settings, colouring the Farmyard green and regional ground red. Interior green reference
pixels are sampled with a two-pixel inset to exclude silhouette edges. Ground should not
obscure those pixels. Repeating the original offset reproduces the leak in the same frame.

| Orbit-distance parameter | Interior pixels | Original offset obscured | Corrected offset obscured |
| ---: | ---: | ---: | ---: |
| 25 | 183886 | 112 | 0 |
| 70 | 21030 | 6385 | 0 |
| 140 | 4932 | 1767 | 0 |

The 140 setting is a stress view beyond the normal user zoom limit. Actual /fjord-play
screenshots also cover near and fully zoomed-out views using the navigation and zoom controls.
Campaign persistence remains exactly equal before/after the render probe. These checks run
in Edge; physical iPad Safari confirmation remains separate.

Targeted terrain, world generation and Fjord projection tests: 26 passed, 0 failed.
TypeScript passed. Formatting was reviewed manually; no formatter is configured.

## Reproduction

```powershell
node scripts/qa/check-farmyard-ground-occlusion.mjs
node --test tests/world-generation.test.mjs tests/regional-ground.test.mjs tests/terrain-treatment.test.mjs tests/fjord-bridge.test.mjs
```

[Measurements](result.json) · [Before/after and scene images](review.html).
