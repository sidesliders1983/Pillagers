# Shared Character Lab moving ground — 2026-10-09

Human, Cow and the focused Meshy preview now use the same PreviewGround component
for floor/grid rendering, continuous movement phase, toggle and pace readout.
The original Lab uses one shared control below Animation in both character modes.
The Cow-only ground renderer and control were removed. No source/prepared assets,
GLB keys/durations, world movement speeds or gameplay balance were changed.

## Public UI verification

The initial test failed because Human had no moving-ground control. The final
scripts/character-lab-ground-smoke.mjs run passed through the existing visible
Lab controls, using Edge with SwiftShader at 1000 × 800 and 390 × 844.

- Human: Walking, Running and Unsteady Walk move the grid; Idle keeps it still.
  The ground toggle stops displayed grid pixels. Freeze stops them too; Play resumes.
- LOD0/1/2: hold a pose while each cold source loads, then resume. All preserve
  the enabled control and Walking reference of 1.21 m/s for this default body.
- Explicit heights 1.20 and 1.60 m yield Walking references of 0.96 and 1.28 m/s.
- Focused Meshy preview: Walking/Running, toggle and Pause/Resume all pass with one
  visible instance. Native source playback remains at 1×.
- Cow: the same Moving ground control/readout, Walking at the authored pace,
  half playback rate, toggle, Freeze/Play and Standing all pass. Motion pixels
  are checked in a clear RTS floor patch; the side view mainly shows stripes
  parallel to movement, which are unsuitable for this pixel comparison.
- Mobile Human: preview loads, Running is selectable and the page has no horizontal
  overflow. Close the desktop page first so the software GPU runs one scene at a time.
- No browser page errors. See public-ui-evidence.json for recorded pace results.

The moving grid wraps every metre to preserve phase across repeated clip loops.
Human pace is the median backward velocity of low stance feet sampled from the
selected clip on the displayed rig. It is a visual reference, not a certification
of zero foot sliding or a new gameplay-speed rule. Cow retains manifest pace and
its existing playback-speed multiplier. Freezing or disabling the grid reports zero.

Source loading holds the last frame and pauses preview updates/rendering. Earlier
headless runs timed out while another body/LOD loaded; holding the frame removes
that repeated GPU work. The final run passed all three LODs and body changes.
Element screenshot stability waits also stalled on the animating preview; the test
captures displayed page pixels instead. Static-grid assertions remain unchanged.

## Regression checks

34 focused Character Lab/Meshy tests passed, with zero failures or skips:
meshy-animation-timing, meshy-lab-integration, character-lab-body-presentation,
character-lab-presentation and character-lab-candidate. TypeScript and production
build pass. The existing large-chunk warning remains. Formatting was reviewed
manually because the project has no formatter command; git diff --check passed.

The earlier full suite and fitting audit belong to their frozen reports; they were
not rerun as part of this ground-only follow-up. Current-head CI remains authoritative.

## Visually reviewed previews

The actual rendered previews were inspected for grid visibility, intact models
and framing, including Cow RTS and mobile Human. Software-GPU FPS is not a hardware
performance measurement. Existing outfit fitting and asset-preview status are unchanged.

| View | Image |
| --- | --- |
| Human Walking | [Walking](human-walking.png) |
| Human Running | [Running](Running.png) |
| Human Unsteady Walk | [Unsteady Walk](Unsteady_Walk.png) |
| Human Idle | [Idle](Idle_02.png) |
| Focused Human Walking | [Focused Walking](focused-walking.png) |
| Focused Human Running | [Focused Running](focused-running.png) |
| Cow Walking, RTS | [Cow](cow-walking.png) |
| Mobile Human Running | [Mobile](mobile-running.png) |
