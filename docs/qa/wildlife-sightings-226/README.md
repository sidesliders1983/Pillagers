# Wildlife sightings #226 QA

## Reproduction

- `node --test tests/wildlife-sightings.test.mjs tests/wildlife.test.mjs tests/wildlife-book-dom.test.mjs`
- `node --test tests/clan-discovery.test.mjs tests/exploration-integration.test.mjs tests/livestock-founding.test.mjs`
- `node scripts/qa/wildlife-sightings-226.mjs`
- Serve the repository with Vite, then open `/scripts/qa/wildlife-sightings-review.html`.
  The explicit loader opens the real Fjord Play with an unread, read or pre-adoption
  checkpoint. The optional 390 px iframe is a manual phone-width inspection aid.
  Extra Food is explicit QA setup; real Core commands produce the actual discovery.

## Determinism and semantics

Focused tests cover real seeded instance IDs, two actual historical witnesses rather
than per-person events, continued proximity/redirect deduplication, quiet re-entry,
separate groups, roster edits, mortality, inactive/returned groups, unknown-species
privacy, fog/range/terrain LOS, malformed records, atomic persistence and exact
save/reload/batched/single-tick replay. Both existing real-island exploration traces
retain their CPU progression and outcomes. Render tests vary frames, cameras and
rendered humans without changing canonical animal motion, and verify pause and
presentation smoothing.

Actual DOM controllers are exercised for explicit adoption, first Attention links,
read state, species/encounter targets, witnesses, current group navigation, keyboard
tabs, Escape and rejection of links from a previous campaign epoch. The DOM harness
does not simulate CSS layout, WebGL or touch hardware.

## Bounded-cost measurement

`measurements.json` was captured on this workstation (Node 24.19). A real seed-32
physical expedition records a gull at tick 5 with founder-1 and founder-2 as witnesses.
Reading does not alter Core bytes; read metadata round-trips and clears on restart.

The explicitly synthetic maximum-observer probe repeats a real route for 16 groups /
62 observer slots. It is workload instrumentation, **not** a valid multi-group save.
With 28 real animals it checks 620 nearby candidates instead of 1,736 full-cross-product
pairs, and performs 16 LOS queries per sample. Five samples cost 4.96-12.55 ms,
including motion and snapshot capture. No detection runs per render frame.

A separate 100,000-event / 5,000-sighting projection builds in 33.76 ms. One thousand
repeated reads take 47.48 ms total and examine zero additional historical events.
Species pages are capped at 20 records; group detail shows five recent encounters.
These are single-machine measurements, not cross-device performance guarantees.

## Visual acceptance limitation

Browser inventory was empty and direct in-app browser creation returned
`Browser is not available: iab`. No desktop/mobile screenshot or visual UAT is claimed.
The manual review page and DOM coverage are supplied so that visual acceptance can
be completed without pretending the unavailable browser check passed.
