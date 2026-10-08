# Universal Human v0.2 — issue #8

The image-generated bald base, three body LODs and the existing PillagersHumanRig hierarchy are retained. Every age uses the same topology and skeleton contract. Head, hands and feet retain their fixed base shape; age changes their placement, so the unchanged head reads larger relative to a child body.

## Lifetime morphology and motion

The supported visual minimum is six years; infancy is out of scope. The age slider spans 6–100. Legacy DNA below six uses the six-year silhouette. Child influence decreases continuously from one at six to zero at eighteen. The coordinated Child morph shortens torso and legs independently and narrows shoulders, hips and limbs. The height slider remains the individual's adult target height (116–160 cm).

Masculinity/femininity and physical build have reduced influence before adulthood. Breast development is suppressed in the child range and progresses with maturity. Elder posture still starts after fifty. Six small combination correctives cover child + power/agility, feminine + power, masculine + agility, tall + slight and elder + overweight. The spine receives a smooth central torso weighting field so extreme builds do not make torso vertices follow nearby arms or legs.

The same Idle/Walk/Run clips are reused. Runtime cadence is faster for children, slower for elders and responds to agility. Stride and arm swing blend toward each bone's original bind rotation, reducing child/elder movement amplitude. Footfall strength responds to physicality and is lighter for children. Core clip motion remains in place; no extra rigs or animation libraries are introduced.

## Automatic appearance

`CharacterAppearance.ts` resolves short, medium, long, tied, bun or braided hair from independently named seed streams and profile likelihoods. Every hairstyle remains eligible for either sex. Style is a derived result, with no selection buttons or saved appearance overrides. All modules use a faceted cap plus small silhouette pieces inspired by the supplied reference.

Beard eligibility is strictly male and age >= 18. Seed determines optional presence; maturity and physicality shift the distribution of stubble, short, medium, long, split braid and single braid. Children and female characters never receive beard or moustache modules. These are optional variants, so some adult males remain clean shaven.

The existing blended heritage palette and its original `hair-shade` seed stream remain intact. Hair and beard share one resolved material colour. Colour remains natural through age 45; greyAmount = clamp((age - 45) / 40), reaching #c2bcb3 at 85. Changing style likelihood never rerolls the natural colour. See CHARACTER-APPEARANCE-V02.md for palette and heritage weights.

Modules fit the actual morphed rigid head bounds and attach to the existing Head bone. Geometry becomes simpler on LOD1/LOD2; combined hair/beard modules stay below one thousand triangles. Each character owns and disposes its module geometry/materials, including pinned comparison instances.

## Clothing and export

A separate simple waist wrap demonstrates the clothing hook. It copies the base's skinning and morphology attributes, shares the same skeleton and follows dynamic morph weights. This is an architecture/fit garment, not the future occupation wardrobe. Body masks, cloth simulation and a clothing library remain out of scope.

Character Lab reports life stage, assigned hair/beard, colour and grey percentage. JSON continues to store the underlying DNA only. Pin comparison supports age and morphology comparisons without appearance controls. Export character GLB includes the current morphology, appearance modules, waist wrap, skeleton and the three original clips. Root extras include the resolved profile and runtime motion parameters; consumers must apply those parameters for the same age-adjusted playback as Character Lab.

## Reference-derived replacement pipeline

The first appearance pass used procedural interpretations, not image-to-3D assets. They remain temporary. A local background queue now takes direct original-sheet crops through Pixal3D, candidate hair extraction and static optimization (1600/1100/800 triangles). Candidate colour extraction and head fit require visual review before these assets replace the procedural styles. Per-style input/provenance/status/logs live in scratch/appearance-v02. No automatic publication occurs. The temporary common scalp cap now has a conservative circumscribed fit plus actual skull-coverage raycast checks on all LODs.

## Validation

Unit tests verify determinism, eligibility at ages 17/18, all hairstyles for both sexes, stable underlying heritage colour and monotonic greying. Binary GLB checks verify all morph keys, rigid head/hands/feet, skinning, sockets and clip contracts. Actual posed-vertex checks cover ages 6/14/35/90, masculinity 0/1, high Physicality/Agility, all LODs and twelve phases each of Walk/Run. They also verify attachment parent, shared hair/beard colour, module triangle budget and clothing skeleton reuse.

`character-appearance-smoke.mjs` checks every automatic hair/beard style, ages 6/14/30/45/55/70/90, every body LOD across age progression, animation switching, pinned comparison and mobile layout. `character-export-smoke.cjs` exports child/adult/elder GLBs and checks their rig, morph weights, modules, garment and clips. Art acceptance remains iterative: these are initial faceted modular shapes and the original generated body topology, not an artist-retopologized final character asset.

### Appearance size ratios

Character Lab now has independent hair, beard and clothing size ratios. They are saved as optional `appearanceFit: {hair, beard, clothing}` in CharacterDNA and included in exported GLB profile extras. Legacy DNA defaults to 1 for each ratio. These controls do not select styles or change the heritage colour, sex, body morphs or the rigid head/hands/feet. Beard controls are disabled when the profile has no beard.

For the temporary modules, hair and clothing have a conservative 100–130% range; beard has 75–150%. Hair adds radial clearance from the head centre without scaling the entire hairstyle; 1.0 is the fitted baseline and 1.3 adds 30% of the smallest head radius. Beard scales around its upper jaw attachment, and clothing changes radial clearance while retaining the body's skeleton and relative morphs. The 100% hair baseline still uses the temporary roomy cap. Final reference-derived modules require visual fit review before replacing it; ratio controls alone do not establish their correct fit.

The reference hair queue uses triangle budgets 1600/1100/800. The first extracted medium mesh retained 733 faces after repeated collapse toward 300, so the smallest budget was adjusted to preserve the topology; final fit and silhouette review remains required.

### Reference module integration

Character Lab now loads fitted `public/appearance/{short,medium}/Hair_{style}_LOD{0,1,2}.glb` geometry. Each output has a provenance sidecar linking the original sheet crop, Pixal3D generation, hair extraction, optimization and fitting transforms. The generated bust faces +Y in Blender; fitting rotates it 180 degrees and preserves its silhouette with a uniform scale. Small disconnected extraction remnants are removed; the fixed base head is untouched. The runtime moves intersecting contact vertices to the measured rigid skull hull with a 3 mm margin, then applies optional radial clearance. Colours remain profile-derived.

All procedural hair and beard primitives have been removed. Unavailable long/tied/bun/braid assets and all beard assets stay absent and are marked pending; there is no substituted hairstyle. Hair clearance is disabled for pending hair, and beard fitting is disabled until a real beard asset is available. Existing profile style selection remains deterministic. These two fitted styles follow the existing Head bone through all LODs, childhood and age-related posture; they introduce no additional rig.
