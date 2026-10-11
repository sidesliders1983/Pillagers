# Living Fjord v0.6C — lifecycle, performance and stability

Issues #95 and #96 share PR #102. The existing LivingWorldController, Fjordside encounter/passing systems, canonical Fjord projection and prepared source models remain the sole behavior/render owners.

## Reconciliation

A source cattle model can change without discarding its safe moving position. A new residence invalidates a resident's old trip while retaining a safe current body position. Dead, away and indoor identities release their visual agents and reservations; canonical history remains in management and saves.

New or returning outdoor identities resolve overlapping presentation positions with a bounded local search. Fenced cattle wait for actual model support. When a bigger body exhausts the remaining gaps, local recovery tries a bounded herd redistribution (at most 12,000 placement attempts) against the same source-floor, wall, fence and body constraints. Safe survivors keep their poses whenever they still fit. Recovery never changes canonical cattle assignment, shelter, overcrowding or capacity.

The authored FarmHut terrain instance uses the existing reserved 13-metre parcel, with a 2-centimetre footprint margin. Only its horizontal terrain dimensions expand; native fences/props follow that terrain transform. House dimensions, body sizes, source GLBs and the relative vertical foundation are preserved. This provides room for four mature collision footprints instead of silently leaving a growing animal unsupported. Larger building levels retain their documented explicit terrain markers/fallbacks. Instance-owned marker/fallback resources are released on replacement; source templates remain shared.

## Cost and diagnostics

Sorted placement candidates are cached per immutable WorldBlueprint. Nature collision queries use an 8-metre spatial index with the original exact clearance predicate. Searches remain bounded by the existing route/target budgets. Moving production labels request compact live producer anchors; their identity map is replaced each frame so removed historical identities cannot accumulate.

The public controller diagnostics report agents, route/target attempts and rejections, search nodes, active reservations/visits, out-of-zone/body-proxy overlaps, bounded herd-recovery counts and CPU update costs. The canvas also reports source actors/templates, owned instance roots, draw calls, triangles, geometries and textures. A renderer callback CPU duration does not measure GPU time or guarantee FPS.

## Resident information

The selected resident has one name-and-line selection label above the moving body. Family and home labels/circles remain. Character traits and heritage use the shared profile content renderer in an expandable section of the existing management panel; no second floating Fjordside card covers the scene. Original Fjordside's own character card is unchanged.

## Current cattle defaults

Young: below 1 Winter. Young Adult (a heifer when female): 1 to below 3 Winters. Adult: 3 Winters and older. Adult cow production, adult consumption and fertility start at 3. Slaughter yields remain 5/10/15 Food by stage. Existing saves/restarts retain their explicit saved age and fertility thresholds, including the former Adult-at-2 rules. Mortality age bands are independent and unchanged. See [Cattle rules](gameplay/spec/05-CATTLE.md).

## Evidence

See [the stability report](qa/living-fjord-stability/report.md) for a default-rate seeded 25-Winter lifecycle run, controlled 10/25/50-resident measurements, physical owner iPad smoke feedback, browser emulation and complete Core/replay comparisons. Historical #95 reports retain their original UI, rules and observations. No new occupation clips, production timing, simulation RNG stream or behavior framework is introduced.
