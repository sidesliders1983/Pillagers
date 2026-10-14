# FjordSide branding

The player-facing /fjord-play route uses **FjordSide** in its browser title, game menu and island loading sequence. The shared initial HTML document also supplies this name before JavaScript loads, including the iOS web-app title. Other development labs retain their existing route-specific titles.

The web app manifest launches /fjord-play in standalone mode. This change adds naming and icon metadata; it does not add offline caching or a service worker. Campaign storage keys and JSON contracts retain their existing identifiers so the rename does not disconnect local campaigns. Export filenames are fjordside-campaign.json (complete Fjord campaign) and fjordside-core.json (canonical simulation).

## Supplied artwork

The owner supplied five images on 14 October 2026. The three square logo images are artwork candidates; the remaining two images show the old Safari title and loading text.

- Image 3, preserved as public/branding/fjordside/source/favicon.jpg: browser favicon at 16, 32 and 48 pixels.
- Image 2, preserved as public/branding/fjordside/source/app.jpg: Apple touch icon at 180 pixels; manifest app icons at 192 and 512 pixels.

All derivatives retain the full supplied artwork. The rounded wooden frame and black corners are part of the source image. Icons use purpose any; no maskable safe-area claim is made. No new artwork was generated.

Regenerate with node scripts/prepare-fjordside-icons.mjs. The existing sharp dependency performs only resizing and PNG encoding. Review the files at /docs/qa/fjordside-branding/review.html.

## Verification

The browser bootstrap check blocks the entry module to inspect the actual initial document. The loading/book browser check inspects the running route, menu, manifest, decoded icon dimensions and both export filenames, alongside the existing canonical opening and retained save-key checks.
