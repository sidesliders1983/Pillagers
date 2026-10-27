# Wedding portrait continuation — revision 003

Owner mobile UAT regression on PR #291 / #288. Baseline source:
`01529b131a8b6e706f12454eeb5114a251b57d99` (runtime build e373f7b).
The original wedding fixture and prior QA reports remain unchanged.

## Reproduced failure

The original shared fixture at
`docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json`
starts paused at Summer 801 tick 550, with 24 Food and 5 Materials. In the actual
production scene at a 390 x 844 CSS viewport, the real eight-person sponsorship
costs 24 Food + 1 Material. The ordinary Food-empty attention notice is therefore
correct. The payment is a retained canonical fact; it is not an error exception.

The directed wedding camera frames the couple offset from the campfire. Its narrow
portrait projection places the campfire outside the ordinary screen rectangle.
The old next-frame visibility check treated that composition as a lost performance,
released the actors/music and restored the normal camera even while paused.
`portrait-before-fix.json/png` record zero active ceremony actors, restored camera,
unchanged tick 550, the retained payment and the empty-Food notice.

## Fix

The shared cultural visibility projection distinguishes actual clan/page visibility
from camera framing. An accepted wedding with its actual active director may frame
the couple without the campfire being onscreen. Clan fog and hidden-page gates
still reject visibility first. Ordinary offscreen gatherings keep their existing
behavior; fire fuel, participants/arrival, safe camera and lifecycle/Skip remain
unchanged. No food, cost, balance, Core command or save schema is changed.

## Reproduce

```powershell
node --test tests/cultural-visibility.test.mjs tests/wedding-camera.test.mjs
$testFiles = rg --files tests | Where-Object {
    $_ -match '(cultural|wedding|fjord-audio|audio-controls|scene-lifecycle|session-lifecycle|soundscape).*\.test\.mjs$'
}
node --test --test-concurrency=2 @testFiles
pnpm build
```

Copy this folder and the original wedding fixture into `dist/docs/qa` after
building. Import using the start menu recovery/import flow, not the narrower
in-game legacy import. Select Wedding celebration at the already selected
campfire, Support gathering, then confirm the real quoted 24 Food once. The
ceremony should remain active while paused; start the clock for the native run
approach, music and performance. The expected Food-empty notice must not end it.

The new projection regression uses the actual WeddingCamera and native RTS
controller at 390 x 844, 844 x 390 and 1280 x 720. It reproduces the actual offscreen
campfire before asserting continued directed visibility, preserves ordinary
suspension, and rejects lost clan visibility and hidden pages. It first failed at
the portrait shot, then passed with the fix. This is a browser-size test, not a
claim of physical iPhone/Safari acceptance. No formatter is configured; source
formatting and diff whitespace are reviewed manually.

Targeted final regression run: **176 passed, 0 failed, 0 skipped**, including the
real running-clock wedding/control serialization comparisons.


## Fixed production browser verification

Runtime source/build: `d7d4bf5e58182691ee180ded2d6ca4d8ef873138`. Public validation
(628 files), TypeScript and Vite production build passed. Later evidence-only
changes do not alter these runtime sources. `validation.json` records exact hashes
and confirms the original fixture, Core cultural rules and audio owner are unchanged.

The exact original save was imported again in the production browser at 390 x 844.
After the same 24 Food + 1 Material payment, the accepted event-55 remained active
in paused approach at tick 550 while Food was zero and its normal attention notice
was visible. Starting the real clock assembled all six staged actors with all
three native instruments, crown and book. The observed gathering reached 8.0265 s
with native music playing, no ambience ducking and no asset failures.

Pause froze the performance and media (8.190839 s). Changing to 844 x 390 and
1280 x 720 retained the same six actors, three instruments, event and paused tick
752. Returning to portrait and resuming completed the normal approximately 30 s
performance. Media became `released`; actor/instrument/accessory bindings became
zero and the original camera `[96, 32.73252868652344, -28]` restored within floating
point precision. The running campaign advanced normally to tick 858; its unchanged
work rules replenished Food. No free Food or altered quotation was used.

Full native screenshots and read-only public debug DOM snapshots record the
before/after states, performance timeline, pause/resize and natural cleanup. No
application state was injected. The active game tab was closed and the temporary
viewport override reset. This verifies responsive browser behavior, not physical
iPhone/Safari listening or performance acceptance. Current-head CI and the owner's
physical device recheck remain pending.
