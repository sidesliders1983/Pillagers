# Wildlife camera independent of the player viewpoint — revision 002

Owner clarification on #292, retained on `codex/wedding-cinematic-288` / PR #291.
Baseline: `4147ab932deb11738739a9290045981056e83932`.
The original #292 and coastal/wedding QA remain historical, unchanged evidence.

## Current behavior

A genuine recorded expedition sighting identifies the exact world/species/animal.
Current clan fog, presence and marine surfacing determine whether it can be viewed.
The player's camera distance, screen direction and frustum/LOD culling do not.
No new Core command, observation, terrain reveal or sighting is created on click.

A safe short approach is preferred. Beyond 96 m, or if that approach cannot pass
safely, one checked local view is adopted before the existing bounded orbit. This
is camera reframing, not animal movement or a long flight through unknown terrain.
Remote collision collection covers only the 64 m destination neighborhood and
retains the same 256-box / 8192-node bounds. Native terrain/water/near-plane/world
clearance and local prop checks remain. Current fog-hidden, submerged or absent
animals retain the factual historical fallback. The first native camera gesture
still takes over; natural completion never restores the old view.

## Reproduce

```powershell
node scripts/prepare-wildlife-remote-review.mjs
$testFiles = rg --files tests | Where-Object {
    $_ -match '(camera|wildlife|marine|attention|touch|discovery|expedition-mode).*\.test\.mjs$'
}
node --test --test-concurrency=2 @testFiles
pnpm build
```

Copy this QA directory into `dist/docs/qa` after building. Start menu recovery/import
accepts these shared campaign checkpoints. Export a personal campaign beforehand.
The generator reuses the prior genuine paid-expedition seed-32/island-168 checkpoints,
including their explicit historical QA-only high Food and quiet demography; it
changes no shipping founding values or saved rules. Presentation changes assert
byte-identical canonical saves.

## Real fixtures

- Seal event-11, `seal:water:0`, Winter 800 tick 30: camera starts about 689 m away.
- Puffin event-13, `puffin:land:0`, tick 40: camera starts about 690 m away.
- A real `ExploreArea` redirect records lynx event-14, `lynx:roaming:0`, tick 105:
  camera starts about 762 m away.
- Real `RecallExpedition` and ten elapsed ticks leave that same lynx alive but in
  `mapped` fog at tick 115. The event is retained, but live focus must refuse it.

Coastal animals are also inside the settlement's ordinary visibility, so recalling
that group does not hide them. The remote lynx is deliberately used to test actual
observer-dependent fog loss. No animal, event, visibility mask or participant is
rewritten to obtain the outcome. The QA controller uses known fixture positions
only to prepare a reproducible test journey, not as a player-facing navigation aid.

## Validation

New tests first failed for the culled offscreen anchor, distant camera, and blocked
intermediate approach; each was made green at the approved public query/camera
seams. The integration case uses real expedition commands, the actual physical
island, native animal assets, native navigation clearance and current clan masks.
It proves paused Core/save bytes unchanged, successful remote focus, the retained
historical event, and refusal without camera movement after genuine fog loss.

The broader targeted run also covers existing discovery, marine, notifications,
touch/native camera exit, lifecycle and wildlife audio behavior. Browser and device
acceptance are separate from the headless/native adapter tests. No formatter is
configured; source formatting and `git diff --check` are reviewed manually.

Executed targeted regressions: **157 passed, 0 failed, 0 skipped**. Raw logs preserve
the three intentional failing tracer tests and the successful final run.
