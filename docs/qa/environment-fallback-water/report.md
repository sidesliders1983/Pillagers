# Environment Lab Compatibility fallback — lighting regression

PR #80 follow-up to d32caadf6f7cf666187dcad6b5c413b304adb133, 9 October 2026.
The approved browser seam is the real Environment Lab rendering and controls.

The fallback reused ReferenceWater but updated it without WorldLighting or the
camera. Night and Low sun therefore left its own sun, sky and gain at defaults.
The Lab now updates lighting and orbit controls first, then passes the current
lighting/camera to the fallback. Wave defaults, phase and the normal boona13 Lab
water remain unchanged.

[Visible water crops](review.html) · [Production samples](results.json) ·
[Failing pre-fix run](red-results.json)

The regression check first failed: Night mean displayed luminance 140.31 versus
Day 147.02. It then passes on the production build for Day, Night, 10°/20°/30° low
sun and 20° front light. Returning to Day produces byte-identical paused water
pixels. Every selection preserves the paused wave time, with no page errors.

The 1200×1000 viewport uses Water level camera and Compatibility fallback, with
ground, nature, village and fog disabled. The sampled crop spans 65–95% of canvas
height, excluding sky/terrain, so scene lighting cannot conceal unchanged water.
Values are mean Rec.709-weighted displayed RGB, not photometric luminance.

| Preset | Mean displayed luminance (0–255) | Held wave time (s) |
| --- | ---: | ---: |
| day | 167.13 | 0.239500 |
| night | 14.85 | 0.239500 |
| sun10 | 81.89 | 0.239500 |
| sun20 | 82.88 | 0.239500 |
| sun30 | 82.97 | 0.239500 |
| sun20-front | 81.59 | 0.239500 |
| day | 167.13 | 0.239500 |

Production build and 14 existing water/depth/lighting tests pass. The original
approved component is unchanged. Source formatting was inspected manually;
no project formatter is configured. Full current-head CI is required before ready.

Run node scripts/qa/check-environment-fallback-water.mjs with QA_ORIGIN pointing
to the desired dev/production server and QA_OUTPUT for captures. No timing campaign
or new performance claim is included. Earlier Fjordside QA remains the record of
its original source revision; this addendum addresses the Lab fallback only.
