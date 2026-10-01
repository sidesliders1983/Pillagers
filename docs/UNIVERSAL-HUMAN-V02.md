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

## Validation

Unit tests verify determinism, eligibility at ages 17/18, all hairstyles for both sexes, stable underlying heritage colour and monotonic greying. Binary GLB checks verify all morph keys, rigid head/hands/feet, skinning, sockets and clip contracts. Actual posed-vertex checks cover ages 6/14/35/90, masculinity 0/1, high Physicality/Agility, all LODs and twelve phases each of Walk/Run. They also verify attachment parent, shared hair/beard colour, module triangle budget and clothing skeleton reuse.

`character-appearance-smoke.mjs` checks every automatic hair/beard style, ages 6/14/30/45/55/70/90, every body LOD across age progression, animation switching, pinned comparison and mobile layout. `character-export-smoke.cjs` exports child/adult/elder GLBs and checks their rig, morph weights, modules, garment and clips. Art acceptance remains iterative: these are initial faceted modular shapes and the original generated body topology, not an artist-retopologized final character asset.
