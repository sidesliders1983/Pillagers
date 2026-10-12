# Campfire VFX spike — #97

This is the campfire step of [#97](https://github.com/sidesliders1983/Pillagers/issues/97), not
completion of its weather/ambient VFX backlog. The owner's later instruction introduces a
real fuel cost, superseding the original issue's decorative-only assumption for this spike.

## Sources and compatibility

- [three.quarks](https://github.com/Alchemist0823/three.quarks), pinned **0.16.0**.
- Its core library **quarks.core 0.16.0** is also pinned directly; the lockfile resolves only
  this version. Both are MIT; notices are in `docs/licenses/three-quarks-MIT.txt` and
  `docs/licenses/quarks-core-MIT.txt`.
- The selected package declares Three.js >=0.165.0; actual build and browser shader compilation
  use the existing **Three.js 0.180.0**. Newer three.quarks 0.17.1 requires >=0.182.0 and was
  deliberately not selected. No renderer, WebGPU or Three.js migration is included.
- [Primary documentation](https://docs.quarks.art/docs) and the shipped 0.16.0 source/types were
  inspected together. Runtime uses its ParticleSystem, BatchedRenderer, sprite shaders,
  ColorOverLife and SizeOverLife. No replacement particle renderer or custom flame shader.
- A 32×32 radial alpha mask is generated locally by the adapter and shared by all systems.
  The preset is authored here; no downloaded textures/presets, editor service, or paid assets.
  The separate owner-supplied StoneCampFire mesh retains its existing provenance manifest.

## Lifecycle and visual settings

`CampfireEffect` binds one stable key to the projected stone-ring anchor. It creates three
systems: flame (22 particles/sec, life 0.7–1.3s), smoke (5/sec, life 2.5–4.5s), sparks (2/sec,
life 1–2s). Low emits 45% of those rates; Normal uses full rates. Per-system emission guards
and bounded lifetimes cap live particles. Flame and sparks share a render batch; smoke uses
a second batch. All sprites use depth testing without depth writes and cannot receive picks.
The existing single non-shadowed campfire point light and ground halo are reused.

The default is Low. Off hides particles and the warm light; reduced motion hides particles
and removes light flicker. Both preserve the factual burning state, fuel and local thaw.
The presentation clock runs only when the campaign is running and visible, independently of
1/3/5-minute year pacing. Paused effects retain their current pose; a newly lit or loaded fire
starts emitting when play resumes. Large elapsed intervals are capped, so there is no
catch-up emission or replay of historical bursts. Sparks and masks never draw Core RNG.

Extinguishing stops emission, allows existing particles to fade, and starts the local snow
return. World rebuild/load/restart and route disposal remove emitters, batches, cloned
materials and the shared mask. Low/Normal switches reuse those resources. The mesh itself
now belongs to the existing canonical entity layer for real picking, rings and labels.
Its 2× source scale, clearing, navigation obstacle and house orientations remain unchanged.

## Verification and boundaries

- `tests/campfire.test.mjs`: public commands, exact 999/1000/1001 fuel boundaries, banked fuel,
  empty stocks, split/individual ticks, replay, save validation and reconciled Clan Book.
- `scripts/qa/check-campfire-vfx.mjs`: touch emulation, contextual controls, snow transition,
  pause, quality and reduced motion, save/load, +1 Year and no-fuel availability.
- [Visual review and recorded results](qa/campfire-vfx/review.html).

The physical iPad still needs owner review. [Seasonal snow and rain](FJORD-SEASONAL-PRECIPITATION.md) now reuse this library and the Local effects setting. Chimney smoke, a generalized
multi-settlement effect registry, ceremonies and gameplay warmth are later work in #97.
