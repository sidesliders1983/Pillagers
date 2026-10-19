# Presentation quality — #211

`src/config/PresentationQuality.ts` owns the existing quality choices and their effective
budgets. It resolves presentation preferences only; it never reads or changes Simulation Core.
The default-preserving consolidation follows #209/#210 at commit
`11fc49d7cb8f7be52bf712206b6cc2ce02d19b5e`. Main remains
`ac3833d4fc286bce5c8522920420a006607a6e0f` at the initial inspection; the only overlapping
open PRs are #212 and #214. Work continues on #214's existing branch.

## Current consumers and application times

| Setting | Existing effective value | Consumer and application |
| --- | --- | --- |
| Preferences | Low quality; Low local effects | `FjordHeader` defaults; explicit saved choices restore through `SharedSettlement.presentation` |
| Renderer creation | Antialias enabled; PCF shadows enabled; general DPR cap 2 | `createRenderer`; antialias is a context-creation choice, not a live toggle |
| Fjord initial DPR | 1 for either saved quality | `createFjordScene` creation, including a restored Standard campaign |
| Fjord live DPR | Low caps device DPR at 1; Standard caps at 1.5 | Existing Quality change handler; CSS layout, text, touch targets and camera coordinates stay in CSS pixels |
| Shadow resolution | Low caps the native map at 1024; Standard uses native day/night sizes (2048/1024) | `WorldLighting.setMode/setQuality`; existing shadow target is disposed and lazily replaced when size changes |
| Water | Low → native Low; Standard → native Medium | `FjordsideWater` creation and `WorldFactory.setQuality`; existing ReferenceWater owns its geometry/shader profiles and safe live replacement |
| Ground source tier | Low/Standard, zoned source pixels 512/1024 from `GroundBlendConfig`; baseline 128/256 | `WorldGroundMaterials` at world creation/replacement; live Quality switches deliberately retain the loaded ground tier |
| Ground maps | Iceland style uses colour only; native Low colour/roughness; native Standard adds normals | Existing material loader; authored style and texture configuration remain authoritative |
| Dressing | Low 40 props / 160 cover; Standard 64 / 320 | Existing deterministic plan subsets in `visibleDressing`; `SettlementDressingLayer.setQuality` changes buffers without regenerating geography |
| Decorative shadows | Standard solid props only; ground cover never casts | `SettlementDressingLayer`; Low omits prop shadows as before |
| Resident detail | Verified native LOD2 at both qualities | `MeshyHumanFactory.createWorld`; existing compatible fitted modules, independent rigs and source caches remain intact |
| Local fire | Low cap scale 0.5, rate scale 0.45; Normal scales 1 | `CampfireEffect`; native flame/smoke/spark definitions remain the source of authored caps and rates |
| Snow | Low cap/rate 300/70; Normal 700/140 | `PrecipitationEffect.configure/update`, live |
| Rain | Low cap/rate 250/180; Normal 600/400 | `PrecipitationEffect.configure/update`, live |
| Off / reduced motion | Particle emission and drawing disabled | Both local effect consumers; existing paused cleanup, fire fuel and snow-thaw behavior remain unchanged |

The different cold/live DPR behavior and replacement-only ground tier are intentional compatibility
constraints in stage A, not claims that every quality axis already switches uniformly. Lightweight
changes do not recreate the world. The native water profile, ground atlas configuration, lighting
presets and model asset registry keep their detailed authored settings; the policy selects those
existing definitions rather than introducing another classifier or asset system.

Quality is copied in the existing presentation sidecar alongside camera state. No canonical save
schema, RNG, ticks, residents, families, missions, discovery, history or hidden-clan progression
depends on quality, viewport, culling or reduced motion. Existing load/disposal guards and
independent home/rival ground caches retain their ownership. No animation cadence or LOD transition
is changed in this delivery, so no new distance switching, fitting loop or LOD cache is introduced.

## Future portrait consumer (#198)

A future on-demand portrait request reads the same chosen profile: its `maximumPixelRatio` gives
the existing resolution constraint and `residentLOD` identifies the currently supported world
body. The caller supplies an explicit CSS/output rectangle and any separately reviewed compatible
portrait-detail request. It must preserve the same resident DNA, source rig and module bindings;
it cannot silently change the world's LOD or infer hidden identities. Actual portrait output
budgets, source eligibility and a bounded on-demand cache remain #198's responsibility. This policy
does not create portraits, extra permanent renderers or background portrait jobs.

## Measured candidate and acceptance

Stage B compares one independent visual axis against this unchanged policy using #151's existing
real-asset fixtures and QA runner. Candidate values, actual device/browser, sustained running
samples, CPU/GPU/frame/resource evidence and the adopt/retain/defer decision belong in the
accompanying QA report. Pixel count alone is not an FPS result. A changed default requires owner
visual/performance approval before merge. Physical iPhone/iPad Safari and thermal acceptance remain
pending under #151 unless actually observed.

The first measured candidate used a QA-only Low drawing-buffer ratio of 0.85 instead of 1.
Three alternating repetitions of the inhabited-village and observed-rival cases did not establish
a consistent end-to-end frame improvement. The decision is to retain the existing values above;
the candidate remains an explicit experiment, not a product setting. See the
[paired measurements and visual comparison](../qa/presentation-quality-211/report.md).
