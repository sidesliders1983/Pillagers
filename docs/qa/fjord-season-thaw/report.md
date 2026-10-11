# QA — northern Spring thaw

Date: 11 October 2026. Correction to #109 / PR #110, based on 400053b.

Result: PASS for the executed build, six public projection/session tests and Edge browser QA.

Winter holds its complete ground/foliage, sky and 0.65 snow treatment through tick 250.
The date changes to Spring at 250 while the scene remains white. Thaw starts afterwards,
reaches the Spring palette without snow at 375, and reaches Summer at 500. Autumn and
rollover keep their previous timing. Weather lighting follows the same visual weight.
Core time, weather draws, lifecycle, resources, events and save format are unchanged.

The browser checks ticks 125, 249, 250, 251, 312 and 374 with exact Core export comparisons.
It also checks 20 weather/season combinations, real quarter/year clock transitions,
partial-year save/load and view handoff, renderer reuse, five viewport layouts (320, 390,
768, 1024 and 1600 pixels), hidden-tab guards and keyboard/menu behavior. Observations
contain the measured snow, actual lighting, layout bounds and resource counts.

[Comparison images](review.html) · [Observed values](observations.json) · [Build log](build.txt).

Images use seed 17, the same camera and Low quality. Water animation phases differ.
Spring at tick 250 is intentionally white; the Spring overview image is tick 375.
Physical Safari/iPad and device sleep were not retested. The old seasons/HUD report
remains historical evidence of the earlier thaw policy.
