# Unified sunlight #237 — implementation evidence

Date: 22 October 2026. Integration base: accepted #236 light/snow work at
`e02c41f96cfc2a0050c17d232523c6f638045001`; main was `d42b878`. Separate follow-up
branch; no automatic merge, default activation or publication.

## What is implemented

- The accepted interpolated sun drives water and land atmosphere with independent
  direct solar and ambient contributions. An absent sun contributes no solar
  diffuse, wave-normal glitter or directional glow.
- Water samples the existing packed native directional shadow at displaced world
  positions. Low/Standard use 4/9 comparisons. Ambient remains unoccluded; no
  additional light, shadow target, water surface or capture/reflection pass is added.
- Explicit coastal receiver bounds stop the 2,000 m skirt entering shadow bounds.
  The receiver covers stored terrain plus 16 m, with a four-texel map-edge fade.
  The matrix object is shared so renderer updates reach water in the same frame.
- Standard/physical land, structure, foliage, character and wildlife materials
  share bounded sunward/view/depth haze. Existing native direct diffuse gates
  land glow conservatively in shadow; this is not volumetric occlusion.
- One linear display-space fog/haze composition occurs after lighting tone mapping
  and before output encoding. Native late encoded fog is removed only in the
  opt-in materials; far-opaque fog keeps its native color for the apron/sky join.
- Hooks are installed at owning creation/discovery/wardrobe boundaries, with no
  frame traversal or material recreation. Replaced material registrations release
  on disposal. Existing snow, wind, skinning, instancing and source hooks remain.

## Executed automated checks

**79 focused tests pass, zero failures and zero skips.** Production public-asset
validation, TypeScript and Vite build pass. Strict QA TypeScript passes. The
existing Three.js large-chunk warning remains; it is not suppressed. No formatter
is configured; source and `git diff --check` are reviewed manually.

The new tests exercise actual native lighting/water/material objects: independent
solar/ambient uniforms, zero-sun behavior, borrowed texture/matrix/reallocation,
unchanged per-frame resource identities/program versions, normalized shared sun
under camera changes/interpolation, bounded sea receivers, snow hook composition,
one color-conversion path and disposal restoration. Tests reject allocating light
snapshot reads and frame scene traversal. Existing light, fog, snow, boat/wave,
native longship passenger, discovery, canonical seasons and save/event equivalence
contracts also pass.

The actual review controller is executed in separate JSDOM page fixtures for #236
and #237. Baseline/candidate restore identical archived Core, pacing, camera and
quality; sunward/away bearings affect presentation only and remain above the
existing minimum tilt. These are functional DOM tests, not browser pixel/layout
or WebGL evidence.

`shader-compile-report.json` records successful offline GLSL compile/link of five
modified WebGL2 shader pairs: Low/Standard water and static, instanced and skinned
native standard material paths. Khronos glslang 16.6.0 compiled installed Three
r180 chunks with explicit light/shadow counts and native sampler-loop unrolling.
The harness aliases Three's unmodified `average` helper name, which conflicts
with this compiler's reserved native symbol; no product shader, function body or
validation condition is removed. The generated programs are not actual driver
or rendered-pixel evidence. Run with `GLSLANG_VALIDATOR` pointing to an installed
official compiler and `node scripts/check-unified-sunlight-shaders.mjs`.

## Proportional cost and ownership

`cpu-report.json` compares eight paired Low/Standard, normal/low, static/panning
camera fixtures. Five warmed 3,000-frame rounds measure actual light updates,
native receiver-crop math and water/atmosphere uniform writes with a mock renderer.
Measured paired increments range from about **−0.00076 to +0.00249 ms per frame**;
these tiny values include runtime noise, not a whole-game performance guarantee.

Resource identities remain stable in the CPU checks. **GPU costs are unmeasured.**
The shader adds 4/9 water shadow comparisons plus view/depth atmosphere math;
unchanged draw count does not establish that per-pixel work is free. Current
renderer counts/programs and frame diagnostics can be exported by the comparison;
use the existing #151 GPU/device protocol for real timings. No render resolution,
source wave/asset quality or shadow quality is reduced to obtain these numbers.

## Review workflow and open evidence

LAN: `http://192.168.68.115:5228/scripts/qa/unified-sunlight-237.html`.
The accepted #236 comparison remains separately available on 5227. The new launcher
uses both existing islands and all fourteen archived phase saves without copying
original source assets or generating substitute images. It offers Low/Standard,
normal/permitted low camera and sunward/away bearings, real-canvas recording and
bounded observation export. Capture Current annual lighting before Unified sunlight.

The browser inventory is empty in this session. **No baseline/candidate screenshots,
pan/tilt video, real GPU or physical iPhone/iPad result is claimed.** HTTP/source
checks confirm the page/shaders are served, not visual correctness. The requested
first baseline capture could not be performed; the fixed comparison workflow is
prepared and functional but is not a substitute for that evidence.

Pending owner/device review:

- Late-spring sunward warm light across the bay, reduced glow away/normal view.
- Actual sunlit/shadowed coast and building water, map edges and shallow sun:
  no detached shadows, acne, rectangular crop edge or excessive glitter/white-out.
- Water/land/fog joins, foreground residents/selection and unknown-terrain masks.
- Both islands/qualities, summer, transition and midwinter, applicable weather.
- GPU/frame/resource measurements and physical device acceptance under #151.

Known bounds: shadows are coastal, not ocean-wide; out-of-map water is unshadowed
with an edge fade. A just-created/reallocated native texture uses an unshadowed
fallback until the following uniform update. Haze is a restrained material
approximation using existing shadowed direct diffuse, not ray-traced or volumetric
visibility. Existing sanitized actor/discovery ownership is reused; no hidden
rival state is queried. These limits require explicit visual review before approval.

Keep the PR draft and opt-in. #237's visual/GPU/device acceptance gates remain open;
do not close the issue from CPU tests or offline shader compilation alone.
