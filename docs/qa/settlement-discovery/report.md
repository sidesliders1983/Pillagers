# Settlement placement: visibility as a diagnostic

Measured 2026-10-13T17:33:38.582Z. This is the owner-approved revision of the earlier #134 concealment requirement, within PR #145.

New Environment Lab worlds use fjordside-island-v0.3e-r3. A rival may be visible from the starting viewpoints. Placement must still use distinct existing natural compartments, six fitting parcels per site, a 160 m center separation, 40 m neutral gap, a 240 m landing route, and at most 0.6 m grading per foundation. The search does not raise terrain to block sightlines, reseed on failure, or add a second classifier. It uses the same gentler-highland formation as e-r2.

| Seed | Selected pair | Natural compartments | Center distance (m) | Neutral gap (m) | Landing route (m) | Exposed / sampled rays |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | site-1 → site-2 | compartment-9 / compartment-3 | 313.2 | 220.2 | 764 | 5 / 1575 |
| 42 | site-2 → site-3 | compartment-8 / compartment-2 | 350.0 | 227.8 | 898 | 0 / 2304 |
| 1983 | site-1 → site-3 | compartment-2 / compartment-5 | 522.4 | 434.6 | 868 | 0 / 1440 |
| 7 | site-1 → site-2 | compartment-1 / compartment-2 | 177.2 | 82.8 | 270 | 180 / 1224 |
| 256 | site-1 → site-2 | compartment-1 / compartment-4 | 390.0 | 272.1 | 586 | 64 / 1620 |

All five fixed seeds pass, repeat identically, round-trip through full save validation and have a walkable final scenery-aware connection. These five examples do not establish a success rate for arbitrary seeds. Complete configurations and blueprint hashes are in [measurements.json](measurements.json).

Sightlines sample the rival construction bounds up to 8 m above ground from the landing, settlement center and starting camera. Exposed rays remain real diagnostic evidence, not rejection criteria or ranking penalties. Future discovery fog is separate; no discovery mask or fog-of-war state is implemented by this change. The existing atmospheric-fog toggle remains purely visual.

The prior e/e-r2 generation contracts still require concealment. The seed-256 e-r2 world retains its concealed pair, passes save/load and matches the saved pre-change fixture when that optional historical fixture is available (this run: true). Existing saves are not upgraded. The earlier height and settlement reports remain unchanged records of their original requirements.

## Browser check

- Touch Generate World accepts an exposed rival, reports it honestly and exports a valid save.
- An existing r2 world retains its concealed site and legacy rule explanation.
- Reimport restores the complete exposed-rival selection.

Microsoft Edge Chromium, touch-enabled 1024 × 768 viewport, Low quality, local Vite server. No browser page/console errors. This is tablet emulation, not a physical iPad test or a performance measurement. The screenshot is the diagnostic island overview, with nature/village/atmospheric fog disabled; representative sightlines, player/rival bounds and access are shown. It is not a new terrain-art comparison.

[Open the review](review.html) · [Browser evidence](browser.json)

## Reproduce

Run `node --test tests/settlement-discovery.test.mjs`, then `node scripts/qa/measure-settlement-discovery.mjs`, `node scripts/qa/check-settlement-discovery.mjs` and `node scripts/qa/publish-settlement-discovery.mjs`. The browser uses port 5180 by default; set QA_ORIGIN to change it. The measure step writes the explicit legacy fixture used by import QA.
