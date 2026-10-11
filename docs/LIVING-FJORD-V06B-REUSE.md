# Living Fjord v0.6B — interaction and activity reuse

Implementation base: main 3610cc2624ccd039d062e8e99b8418eccb1598b9 (merged PR #101).

| Source | Consumer / integration |
| --- | --- |
| MovementSystem's residentMovementConfig, predictive exclusive pairing, five active seconds, three-second cooldown plus separation | Extracted into SocialEncounters; both original Fjordside and LivingWorldController consume the same behavior. Numeric prototype IDs are adapted to strings, separate from canonical romantic partner IDs. |
| MovementSystem's committed pair/neighbor passing and turn-before-walk | ResidentPassing and turnToward are shared; each view retains its navigation and terrain authority. Existing original movement regressions remain requirements. |
| MeshyHuman semantic animation and crossfades | FjordModels calls the existing per-person model: Talk_Passionately / Listening_Gesture, Pull_Radish (Farm), and the one-shot Attack. No second human mixer or body regeneration. The verified additive Human v2 pack supplies Sit_and_Doze_Off. |
| Four cattle variants' prepared GLBs and manifests | Existing per-instance FjordModels mixer selects Idle, Walk, Graze (12 s), HumanInteraction (6 s). An interrupted graze retains its remaining active time and source clip phase. A cattle wander blocked by herd mates for three active seconds yields to the next grazing/rest turn on its current safe support. |
| CowCharacterPreview human-facing interaction | cattleVariants shares the original stage spacing; the human plays Listen as in the preview. Only a manual preview trigger existed: safe world proximity and shared reservation arbitration are new wiring. |
| WorldBlueprint coast, homes and rendered nature | Short occupation visits use the same controller and route search, reaching a safe approach before facing/playing a clip. Instance source anchors survive nature compaction; only actual standing trees are targets. |
| Canonical work eligibility, visibility and source yard queries | FjordProjection uses inspectWork; indoor young children/caregivers and deceased/away identities cannot participate. Source yard/fence constraints remain authoritative. |
| Moving selection, shared profile, family markers and resource anchors | Existing consumers continue to follow the single current transform. Canonical production feedback stays factual, independent of the selected animation. |

## Visits and source availability

Farmer visits require the resident's actual permanent Farmyard. Several exterior working-ground spots are possible; no fields or new structures are invented for tent households. Woodworkers approach actual standing trees and perform one authored Attack cycle. Hunters explore tree/forest-edge approaches and pause briefly, without a fabricated hunting clip or kill.

Fishers choose reachable dry shore approaches facing the water. The original Human source has 14 clips. The owner supplied Human-textured-v2.glb with four additions: Archery_Shot_1, Archery_Shot_2, Heavy_Hammer_Swing and Sit_and_Doze_Off. Its complete node hierarchy, bind matrices, geometry and skin weights match the original source. prepare-human-extra-animations.mjs exports only the additional animations into a separately hashed pack. The shared default MeshyHuman loader adds those clips to each verified native body; existing body LOD bytes and fitting identities remain unchanged. Character Lab exposes the four additions, and the fisher uses the real Sit_and_Doze_Off clip. Archery and hammer previews add no hunting or smithing gameplay.

Before that source arrived, the official Meshy API catalogue identified action 268 but returned no existing rigging tasks for the configured account. No paid generation was submitted. Re-uploading a GLB follows Meshy's new rigging workflow; an existing cloud rig is preferable when available. A missing or incompatible animation extension retains the original body and clips; a missing Doze capability produces an explicit bounded Idle shore fallback, rather than an invented alias.

The ordinary wandering range stays within 28 metres of the home anchor. A local occupation adapter permits safe goal-directed trips up to 75 metres from that anchor, allowing the original founding fisher to reach a coast within 70 metres. The same dry-ground, slope, source fence, parcel, nature and segment safety checks apply. A bounded goal-guided search considers current body occupancy; it does not teleport to the activity target. Shared passing looks one body clearance beyond a short waypoint and uses continuous body checks, retaining the main destination when a passing detour needs replanning. An occupation leg that moves less than one metre over eight unpaired active seconds retries the same goal against current occupancy. This prevents a neighbour pass from circling in a narrow corridor; it never extends the finite travel budget.

Activities alternate with walking, independent seeded start offsets, ordinary wandering/social encounters and home returns. Farm/Attack duration comes from the loaded authored clip and existing DNA cadence. Attack retains its global one-shot contract. The activity owner cannot also hold a person/person or person/cattle lock. A trip can be interrupted by an encounter; its destination is retained when still valid. Missing clips or removed targets release the visit; inaccessible targets retry on a bounded schedule. A due visit can replace ordinary wandering outside a reservation. Approach and home legs receive a distance/pace budget (30–240 active seconds each); timeout releases the slot and takes a break. Activity time and paired encounter time cannot run concurrently.

## Ownership, clocks and economics

LivingWorldController owns each canonical actor's transform; FjordModels owns its animation. The original MovementSystem never runs concurrently on these actors. Namespaced persona/cattle keys are transient presentation identities. No ambient activity changes canonical Persona.partnerId, RNG, stocks, workProgress, event history or replay.

Pause, hidden tabs, scene loading and view transfer stop active presentation time without catch-up. Winter pace does not multiply animation speed. Existing five-Winter saved/default childcare, independent two-Winter birth cooldown, age-five visibility and Farmyard yard/overflow rules remain unchanged.

Production popups report actual Core awards at the producer's current position, even during a talk or work animation. A radish pull, chopping gesture or shore pause creates no award or Lore fact.

See the focused browser evidence in docs/qa/fjord-interactions and the retained public movement/controller regressions. Physical Safari/device performance must not be inferred from headless Chromium touch emulation.
