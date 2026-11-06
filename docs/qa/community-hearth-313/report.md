# Community Hearth trial verification

The owner approved 15 and 30 Materials, full cold-window heat of 10%, 20%
and 30%, and newly earned occasion support at ×1.00, ×1.25 and ×1.50 for the
first playtest. The trial starts from the `communityHearth=1` URL option and
persists with the adopted save. [Current rules](../../gameplay/CULTURAL-EVENTS-PROTOTYPE.md#community-hearth-trial-313)

The two supplied models use 2,135,096 runtime bytes together. The source-to-game
pipeline and measured footprints are recorded with the [asset provenance](assets.md).

## Rules and placement

- The 186 focused tests passed. They cover exact costs, legacy paid-fire
  adoption, the cold-quarter accumulator and tier weighting, available and away
  residents, reserve consumption, save validation and deterministic advancement.
- From 200 basis points of Severe exposure, full Campfire, Shelter and Hall
  operation produces 180, 160 and 140 basis points respectively. Full Hall
  operation plus newly earned Hall support produces 88 basis points after
  integer rounding. Natural risk is recorded separately.
- The shared structure reserve holds the largest model. Island 88 places it 38 m
  from the fire, with a supported stone base and an outdoor path. Island 101
  reports unavailable placement before charging. A legal v1 island roundtrips
  with its saved geography. Crowded legacy terrain and forged placements are
  covered by the placement tests.
- TypeScript, Vite and decoded public asset validation pass. Code formatting
  was reviewed manually and `git diff --check` passed.

## Browser observations

The desktop interaction run bought the Shelter and Hall with exact 15 and 30
Materials debits, preserving paid fuel at each purchase. It reached a real
outdoor storytelling event at tier 1 and a communal ceremony at tier 2. The
first receipt retained its 31.25% strength after the second purchase. An active
occasion blocked the upgrade. Reload retained tier, time and fuel, and importing
the downloaded Shelter checkpoint restored that earlier state. The blocked
island retained its stock and original fire. This run preceded the final
framing refinement. [Desktop results](evidence/desktop-results.json)

In native Chrome touch emulation at 1024×768, View closed the card and a real
Hall tap reopened it. The wedding used the actual new partnership, recorded
24 Food for its eight attendees and reached the outdoor gathering phase with
both partners and five arrived actors. The first diagnostic exposed crossing
routes in the forced venue-facing layout. The final version scores the bounded
existing outdoor layouts with the venue angle first. [Touch results](evidence/touch-results.json)

The last desktop run showed the Hall, path, fire and communal gathering together
in the revised view. All three runs reported zero page errors.
[Overview results](evidence/overview-results.json)

| View | Browser capture |
| --- | --- |
| Gathering Shelter | [Outdoor structure](evidence/gathering-shelter.jpg) |
| Clan Hall | [Winter fire and Hall](evidence/hall-and-campfire.jpg) |
| Communal ceremony | [Hall, path and gathering](evidence/outdoor-hall-overview.webp) |
| Wedding | [Arrived couple at the outdoor ceremony](evidence/outdoor-wedding.jpg) |

Chrome touch emulation covers the UI and cast behavior. Physical iPhone review
and owner visual acceptance are still open before default activation.
