# Rival visibility and eight-direction routes

The fresh seed-32 test physically reaches the existing rival and renders its observed actors in the real Fjord scene. Campaign seed 32 uses curated landscape seed 18; it is not a separate island shape.

## Corrections

- A visible tent or resident was incorrectly suppressed whenever the settlement centre cell was not currently visible. Actors now use their own discovery cells. An unknown centre is not disclosed, and unseen live information stays hidden.
- The movement validator checked a straight chord across a hillside corner instead of the accepted route edges. That could falsely start an automatic return. Validation now follows the actual crossed edges, without copying complete route arrays or searching again each tick.
- New fixed-pack Explore and separate island mission orders use eight-direction deterministic A*. Diagonals retain actual distance and speed; both adjacent cardinal cells must be safe. Existing saved journeys retain recorded geometry. Redirect, recall and exact home positions are preserved through save/load.

## Validation

49 related Core, spatial expedition, island mission and rival tests pass. New regressions cover diagonal speed, partial-edge redirect/recall/save-load, blocked-corner detours and corrupt saved shortcuts, accepted uphill turns in both directions, and observed outskirts with an unknown centre. TypeScript, all 453 public files/47 decoded terrain models and the production build pass. The existing bundle-size warning remains.

The [browser result](browser.json) records a real seed-32 campaign, one founder and a paid 10-Food test pack. After 368 confirmed ticks the party sights the rival with 2,132 active supply ticks left and 1,783 ticks available for further exploration after the protected return allowance. The actual renderer loads the observed tent, resident, cattle and campfire assets without placeholders. A real page reload preserves the exact paused campaign and visible rival. No page errors. The screenshot was inspected visually. This is desktop Edge evidence, not a physical-device performance claim.

The owner's exported seed-32 campaign was inspected separately without altering it. Its rival exists with ten living residents, but its centre is unknown. The closest point on the saved reached/return trail is about 152 m from that centre, outside the 64 m observation radius. The suspected empty clearing is not the rival site. This diagnosis does not prove that either corrected defect caused that particular screenshot.

## Reproduce

Run `node scripts/qa/check-rival-visibility.mjs` against the current served checkout (default `http://127.0.0.1:5180`, override with `QA_ORIGIN`). The script creates its campaign through public commands, pays the test pack, follows accepted land waypoints and loads the actual saved scene. Outputs are written under `artifacts/rival-visibility/`.

Open [the review](review.html) for the screenshot and paused generated review copy. Historical #150 measurements retain their original rules and outcomes.
