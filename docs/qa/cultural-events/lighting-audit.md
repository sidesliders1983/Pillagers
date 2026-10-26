# Cultural gatherings: lighting and shader audit

Baseline: `fb327996013b115bff985f7f87b7a69ff37eb24f` (fresh main for #274).
This is a source audit and presentation recommendation. No rendered/device/GPU result is claimed.
No runtime code or tests changed in this audit.

## Recommendation

Reuse the existing campfire illumination unchanged for the first #275/#276 gathering.
Actual residents staging around the existing settlement centre provides the visual distinction.
A gathering does not justify a second light, brighter fire, new shadow map, shader variant,
particle emitter or weather treatment. This preserves the recent default-Low texture savings
and avoids a cosmetic lighting signal being mistaken for an earned gameplay effect.

The proposed cultural Food payment and the existing campfire Material fuel are separate.
An event can be recorded with an extinguished fire: it must not light the fire, spend Materials,
advance its heat, thaw snow or change the time/season. A player may separately use the existing
fire control under its existing Core rules.

## Existing public presentation ownership

| Existing owner | Verified source behavior | Required gathering behavior |
| --- | --- | --- |
| `src/core/WorldLighting.ts:17,68-80` | One PointLight with `castShadow=false`; one existing 32-segment ground halo with a fixed shader | Allocate no additional lights, geometry, render targets, textures or programs |
| `WorldLighting.ts:314,343-352` | `setCampfire(lit,time,reducedMotion)` supplies the visual fire authority; light/halo visibility is gated by `lit` | Continue using this authority rather than event attendance or animation contact |
| `src/config/lightingConfig.ts:20-23` | Existing bounded fire flicker/intensity/radius/halo configuration | Do not increase these values for sponsored events |
| `src/effects/CampfireEffect.ts:113-135` | Fire heat warms over 3 active seconds and cools over 6; particles use existing quality budgets | No event-specific heat multiplier, rate increase, spark burst or particle system |
| `src/fjord-play/FjordEntities.ts:142-143` | The campfire instance snow multiplier is `1 - heat` | Only the existing fire heat may change snow coverage |
| `src/fjord-play/FjordScene.ts:298-307,558-562` | Creation and committed snapshot updates use `inspectCampfire(state).lit` | Culture presentation cannot call a lighting command or synthesize `lit=true` |
| `FjordScene.ts:703-707` | Existing frame loop advances fire effects only while running and visible, then passes its time/lit state to lighting | Add no requestAnimationFrame loop, wall-clock catch-up or parallel fire timer |
| `src/config/PresentationQuality.ts:10-11,55-63` | Default Low/Low; reduced motion disables particle animation | Preserve these settings and existing light behavior when Effects is Off |
| `WorldLighting.ts:123-128`, `CampfireEffect.ts:139-156` | Owners dispose their existing resources | A gathering must add no resource that survives replacement/disposal |

`StructureSeasonTint` already owns per-instance snow uniforms and source-material preservation.
Do not introduce a cultural shader define or clone its materials again. Existing halo raycasting
is disabled, so the ground glow cannot interfere with resident/campfire selection.

## Visibility, pause and lifecycle

Use only the player's already displayed settlement campfire. Hidden/offscreen rival events may
resolve in Core without creating any light or revealing their position through the fog. Do not
change discovery, fog, sunlight, shadow coverage or exposure to improve an event screenshot.

Pause/hidden state freezes the existing fire's presentation time. Reduced motion keeps its
existing steady lighting path. Missing motion/audio assets never affect illumination or Core.
Scene replacement receives the replacement clan's actual saved fire state; no event-local light
state carries across campaigns or load/rollback.

## Public integration shape

No new lighting API is required for the first slice. The culture presentation owner consumes an
accepted canonical event and available actual actors; the existing lighting owner continues to
consume only `setCampfire(lit,time,reducedMotion)`. Keep this separation visible in the scene code.

If a later owner-reviewed visual pass calls for an emphasis envelope, it can be a bounded scalar
on the existing halo opacity, default zero, gated by a legitimately burning and visible fire.
It should fade within the existing frame loop, stop while paused/hidden, remain static under
reduced motion, clear on event/scene replacement and allocate no additional material/program.
That optional embellishment is not implemented or needed to establish the first gameplay payoff.

Potential future owned runtime file: `src/core/WorldLighting.ts` only if such an emphasis is
actually selected. `FjordScene.ts` wiring must be coordinated with its integration owner.
Do not create a parallel cultural lighting subsystem.

## Acceptance checks for the integrated slice

These are pending checks, not completed results:

- Compare the same saved world/camera/quality before and during a gathering: identical light,
  shadow-map, texture, geometry and program counts.
- Verify lit/off, exhausted fuel, pause/hidden return, Low/Standard, Effects Off and reduced motion.
- Verify no extra snow melting, exposure change, fog disclosure or automatic fuel command.
- Replace/reload a scene during presentation and confirm no retained event lighting resources.
- Review daylight and dark-Winter gathering readability on an actual iPhone/iPad; record actual
  frame/GPU measurements separately from the source-derived zero-allocation design.

There is no repository formatter configured for Markdown. This document was checked manually;
no new tests were written while the agreed test-seam confirmation was pending.
