# Wildlife — resting motion revision 005

The supplied harbour recording shows the simulation's play triangle. Wildlife
correctly freezes with that paused simulation. With the clock running, the shore
otter autonomously walks valid routes: on the curated campaign fixture it travels
16.95 m in 60 seconds, spending 50.7 seconds roaming and 9.3 seconds resting
(`shore-otter-roaming.json`). No habitat, speed, fear or pause rules are changed.

There was nevertheless a separate resting regression after replacing procedural
locomotion with Meshy clips: non-moving animals were sampled at time zero without
any head or breathing movement. All seven Meshy species now retain a dedicated
additive resting pose over that frame: bear, wolf, fox, lynx, reindeer, otter and
seal. Species profiles keep breathing, head scanning and appropriate tail motion
small and individually phased. Hauled-out seals move their head and upper body
without translating or crawling in place. Water variants continue using their
source locomotion clip while swimming.

Every overlay snapshots its input joint rotations. Before the next mixer sample,
its previous changes are removed. This also handles repeated identical mixer
times, where Three.js can skip writing an unchanged animation channel. Resting
movement therefore cannot accumulate into the source loop or reset a paused
walking pose. Idle motion uses the same paused wildlife clock as locomotion.

Grounded gulls gain independent left/right head targets with smooth neck blending.
They retain the original geometry, UVs and topology. The two head targets combine
with the existing folded-wing target, preserving wing and foot positions. Each
bird scans for 5.5 seconds within a 14–21 second phased cycle, with a longer neutral
rest. Existing wing spreads remain 3.6 seconds per 29–35 second cycle; ascent-driven
flight wingbeats are unchanged. All of this freezes during game pause.

## Validation

All 28 focused wildlife, Fjord yard-cache and presentation-quality tests pass.
New assertions cover visible finite resting skin motion for all seven species,
independent seal poses, autonomous shore otter roaming, exact pause, removal of
all rest offsets before source-clip playback, and independent gull head targets
with unchanged folded wings and feet. Earlier reindeer, rabbit, source clip,
resource sharing, disposal and habitat checks remain green.

The actual WildlifeLayer browser review sampled all seven species in rest and
confirmed changed head poses with unchanged logical position and no layer
habitat diagnostics. The grounded gull changed from morph influences [1,0,0] to
[1,0,1], retaining its folded wings while turning its head. Observations are in
`browser-inspection.json`. The local review is
`/output/otter-idle-001/index.html`. This is a focused layer review, not a full
Fjord Play end-to-end browser test.

Public asset validation, TypeScript and the Vite production build pass. The build
retains its existing chunk-size advisory. No formatter is configured; changed
source was inspected manually and checked with `git diff --check`. The temporary
Cloudflare playtest is updated from this checked build; the public main-based
Sites deployment is unchanged.
