# FjordSide branding review

14 October 2026. Parent: main at e50d83e (merged PR #162).

## Result

The playable /fjord-play route identifies itself as **FjordSide** in the initial HTML, browser title, loading sequence, game menu and mobile web-app metadata. Exported files use the new name. The six supplied-artwork icon derivatives decode at their declared sizes.

The owner supplied image 3 for the provisional browser favicon and image 2 for the more detailed app icon. The originals are retained with the deterministic resize script. No artwork was generated or redrawn.

## Evidence

- Bootstrap regression: the new title assertion failed against the old Pillagers title before implementation. After implementation all nine route documents passed while their JavaScript entry module was blocked.
- Mobile Chromium/Edge browser emulation, 390 × 844 with touch: loading eyebrow and menu title read FjordSide. The manifest reports FjordSide and starts /fjord-play in standalone mode. All three favicon sizes, the Apple touch icon and both manifest icons decode successfully. Both downloaded filenames match the new naming.
- The existing founding chapter remains byte-identical through loading and the ordinary Clan Book reader; scroll position is retained. The final campaign is still Summer 800 at tick 500 and uses the existing active-session storage key. No page errors were reported.
- TypeScript check and Vite production build passed. Vite retains its existing large-chunk advisory.

See [machine-readable browser results](results.json), [loading capture](mobile-reading.png), [game menu capture](menu.png), and the [icon gallery](review.html).

These captures use desktop Edge with phone emulation. Native Safari share-sheet and home-screen icon presentation, and Android launcher installation, have not been tested on physical devices. No service worker or offline mode was added.

## Reproduce

~~~powershell
node scripts/prepare-fjordside-icons.mjs
node scripts/qa/check-route-bootstrap.mjs
$env:QA_OUTPUT='docs/qa/fjordside-branding'
node scripts/qa/check-loading-clan-book.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
~~~
