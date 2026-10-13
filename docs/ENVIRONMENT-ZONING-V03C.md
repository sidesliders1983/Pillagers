# Environment zoning v0.3c — version 1

Issue #135 adds an optional saved description of canonical terrain. Enable **Environment zoning · v1 (new worlds)** in Environment Lab and generate a world. The checkbox applies to generation; importing a world uses its stored configuration.

## Ownership and compatibility

The existing generator version selects terrain/site generation. Optional `config.environment.version: 1` selects this environmental transform; `world.environment.version: 1` stores its output. Missing configuration and fields retain the original zoning/nature path. Import validates stored data without regeneration. Changing conifers or renderer quality retains the fields. Future formula changes require a new environment version and must not silently rewrite saved worlds.

The 4 m grid samples the authoritative 2 m heightfield. Triangle gradients use exactly the alternating topology used by the height query and renderer. Water remains defined by terrain elevation relative to sea level. Environmental queries do not replace physical water, slope, movement or building queries.

## Public contract

`sampleEnvironment(world, x, z)` works without Three.js. It returns null without the extension or outside the grid. Nonfinite coordinates on a zoned world are rejected. Scalar fields interpolate bilinearly; aspect interpolates circularly. Primary type and region ID use the nearest sample. Coast interpolation can mix water and land values: use physical height for wet/dry decisions.

| Field | Units / range | Meaning |
| --- | --- | --- |
| primary | water, grass, sand, mud, bedrock | Dominant substrate after small interior fragment cleanup |
| regionId | integer | Connected four-neighbor component |
| slope | rise/run, m/m | Canonical triangle gradient magnitude; not clamped to 1 in data |
| aspect | radians, 0–2π with 0.001 rounding tolerance | Downhill clockwise from north (+Z); flat ground uses 0 |
| moisture | 0–1 | Lowland, concavity and wind shelter increase it; steep drainage reduces it |
| shelter | 0–1 | Local concavity and terrain rising toward the wind source |
| rockExposure | 0–1 | Steepness, convexity, exposure and a smaller relative-elevation contribution |
| forestCover | 0–1 | Broad seeded cover conditioned by moisture, slope, shelter and substrate |
| snowRetentionPotential | 0–1 | Climate-conditioned potential; no snow visuals |
| grass, sand, mud | each 0–1 | Ground influences; together with rockExposure sum to 1 on land within rounding |

Fields are quantized to 0.001. Region records include type, bounds, approximate area and adjacency. Coverage counts grid samples including sea. Areas are sample count × 16 m², not exact polygons. Primary cleanup can differ from the largest raw influence at a small fragment; continuous influences remain available for #136/#137.

## Derivation and bounds

Zoning runs after terrain and optional #134 foundation treatment, before nature. It uses a private seeded RNG/noise stream, never Simulation Core randomness. Noise supplies broad cover patches and limited boundary variation (roughly 125–143 m nominal noise scale).

Eight samples 32 m away estimate concavity/convexity. A sample 48 m toward the wind source estimates shelter. These are descriptive proxies, not physical erosion, groundwater, wind or solar simulations. Outside the bounded world, existing deep-sea continuation applies.

Rock rises smoothly with slope from 0.18 to 1.25 m/m, with smaller convexity, exposure and 15–65 m relative-elevation contributions. A low cliff can be more exposed than a gentle highland. Aspect affects snow retention, not terrain shape.

Sand follows coast distance, sheltered shore width and low gentle terrain; steep shores can stay rock. Mud needs moisture, low elevation, gentle slope and distance away from the water edge. Highland flatness alone cannot create a swamp. Forest overlays soil, limited by exposed rock, sand, wetland and steep terrain. Nonshore interior primary components below nine samples merge toward their most represented adjacent type. Water and narrow shore components remain intact.

## Climate calibration

Normal zoning uses a **prototype descriptive calibration**, not a regional weather dataset: annual sea-level mean 6 °C, lapse 6.5 °C/km, wind from 315°. This produces no permanent snow potential at these island elevations. No gameplay weather rule or perpetual snowline is introduced.

The API accepts explicit climates (meanAnnualTemperatureC −40…40; lapseRateCPerKm 0…12; windFromDegrees 0…<360). A −8 °C fixture tests future cold-climate behavior; it is not a campaign default or offered fictional preset. Below freezing, potential increases with cold, sheltered concavity and northern aspect, and decreases on very steep cliffs. This is not a seasonal accumulation model. Existing seasonal effects remain independent.

## Existing consumers and reserves

BiomeField remains a compatibility projection: physical water, foundation/path clearing, bedrock → rock, sand → shore, covered soil → forest, other soil → grass. Mud keeps its canonical identity but currently uses the existing grass/soil treatment. Actual blending/detail belongs to #137. No new shader or asset is introduced.

Approved conifers require canonical forest cover ≥0.4 plus existing placement checks. Other approved props retain their habitat and clearance rules; isolated deciduous trees may occur in grassland. Asset budgets remain unchanged, so forest cover expresses suitability rather than dense forest at the 800 m scale. Player/rival foundations and critical access/connection routes retain their exclusions. Rock labels do not make land impassable: physical terrain and placed obstacles remain navigation authority.

The inherited #134 six-parcel Lab layout and rejection reasons remain. This issue does not resolve the real campaign allocator limitations in the [capacity review](SETTLEMENT-CAPACITY-REVIEW.md), or enable new islands in production campaigns.

## Lab and verification

The Lab exposes ground boundaries, forest cover, moisture, shelter, slope, aspect, rock exposure and snow potential. Unzoned worlds and Reference Fjordside disable those overlays. The coverage/legend disclosure lists approximate region areas and adjacency. Scalar displays use dark = 0, bright = 1. Slope display saturates at 1 m/m; the stored value does not. Source-material view uses the existing approved pipeline.

Tests use the agreed public blueprint/query/save-load interfaces and browser controls:

- `node --test tests/environment-zoning.test.mjs`
- `node scripts/qa/measure-environment-zoning.mjs` — ten paired seeds; local full saves in scratch
- `node scripts/qa/check-environment-zoning.mjs` — running Lab; QA_ORIGIN overrides localhost:5180

See the [measurement report](qa/environment-zoning/report.md) and [comparison gallery](qa/environment-zoning/review.html). Historical reports remain unchanged.
