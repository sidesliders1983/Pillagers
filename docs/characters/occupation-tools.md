# Occupation tools

The four supplied tools occupy the existing independent **Equipment** slot on Meshy Human. Character Lab offers Farmer · sickle, Fisher · fishing rod, Hunter · bow and quiver, and Smith · hammer. Fjordplay explicitly assigns the corresponding tool to adult residents with canonical occupation farmer, fisher, hunter or smith, regardless of sex. Children and other occupations receive none. Clothing, hair and headwear remain separate selections.

## Source preparation

Original filenames, SHA-256 identities and triangle counts are pinned in scripts/characters/occupation-tools.sources.json. Raw copies live under Assets/Characters/Human/Tools; the supplied iCloud originals are unchanged. Run node scripts/prepare-occupation-tools.mjs from the project root to reproduce fitted GLBs, bindings, provenance and catalog measurements.

Preparation preserves the original triangles, UVs and source colour maps: sickle 2,901 triangles, fishing rod 3,112, hunter source 3,039 and hammer 2,677. Albedo maps are reduced to 1,024 pixels and metallic/roughness maps to 512; normal, occlusion and emissive maps are removed. Final GLBs are approximately 0.6–0.9 MB each rather than 47–50 MB. No new Meshy conversion is used.

The supplied hunter file contains a bow and a complete quiver with arrows and strap. They are separated along the existing disconnected geometry without cutting faces. The missing bowstring is an explicit authored addition: a simple sixteen-triangle linen cord between the original bow tips, bringing the final hunter set to 3,055 triangles. Source colours, including leather and wood, remain fixed rather than inheriting DNA hair colour.

## Fitting and motion

Neutral source-body measurements calibrate each grip before motion. Tools reuse the unchanged 44-bone native Human rig and exact body topology identities at all three body LODs. The bow and its string use LeftHand (11), the quiver uses Spine2 (3), and the other tools use RightHand (24). Every vertex has one full native influence. There are no duplicated bones, body masks or replacement characters. The new rigid-native-equipment contract validates each named part, socket, weight and frozen source identity before installation.

The sickle retains its source scale; the hammer is scaled 1.75 times. Both have a downward, slightly forward carry. The rod is scaled to 60% of source size; its overly thick lower grip is narrowed locally to 55%, blending back to the original width above the handle. The upper rod, line and hook retain their source proportions. The bow is scaled to 65%, with its curved limbs facing away from the torso. The independently fitted quiver is 64 cm high, behind the right shoulder, leaving the central braid clear. These are measurements in the native source frame; the existing DNA skeleton and resident height normalization also affect the rendered size.

Only the authored hand is offered in Equipment carry; arbitrary hand/back overrides are not exposed. Carrying uses existing Walking and Idle 02 clips and their native hand poses. Fishing-line physics, bow draw, hammering and harvesting actions are not implemented. The rod's supplied line and hook are part of the same rigid carried item. This is visual occupation equipment, not a gameplay inventory, weapon or work-action change.

Only back-bound equipment participates in existing long-hair collision clearance, so a hand tool cannot push the braid away. Each resident owns its fitted geometry and materials; shared source geometry and textures remain reusable. Removing equipment leaves the body, clothes, hair and hat intact. Occupation and age changes are reconciled on the same live Human, with the existing obsolete-request and retry guards.

## Review and checks

The interactive review is output/occupation-tools-001/index.html. Select occupation, hair, front/back/side or grip close-up, and native neutral, Walking or Idle 02. The original neutral pose is the fitting baseline; animated views are subsequent movement checks. Character Lab supports ?tool=farmer, ?tool=fisher, ?tool=hunter or ?tool=smith, combinable with existing hat, hair and clothing query presets.

Focused tests in tests/occupation-tools.test.mjs cover hashes, source topology and maps, registry/snapshot identity, native joints and rigid motion at all body LODs, no body masking, independent colours, owned source clones, None/reinstall and malformed bindings. Existing wardrobe tests also exercise adult occupation changes with tools and hats. Browser evidence and sampled motion bounds are saved alongside the review. Gameplay rules, production output, save data and Core RNG remain unchanged.


## Corrected hand grips (recipe 2)

The first tool review proved attachment stability but missed the actual grasp: handles followed the long axis of the hand, with the tool resting against the hand rather than being enclosed by the fingers. QA now checks the shaft against the actual finger cavity, plus palm/knuckle close-ups with and without clothing.

The curved Middle1–Middle3 joint positions determine the shaft axis and the circumcentre of the grasp. The source-authored right-hand finger pose is sampled from Idle 02 at 0.6 seconds; only those six finger rotations are retained. The left hand uses reflected world-space joint deltas from that closed grip because the source Idle left hand remains loose. This does not use an animated body as the fitting reference: source body, clothing fit and Native neutral remain unchanged.

During Idle 02, Walking and Running, the equipped wrist and fingers use that fixed grasp. A bounded upper-arm/forearm carry layer prevents the clip's unrelated arm or wrist twists from turning the item across the torso. The original animated output is restored before every layer application, without accumulation. Removing equipment or switching hands restores the empty arm immediately. Other authored clips, including Attack, keep their original pose. No new bones, clips or body geometry are introduced.

Only the handle sections are narrowed: sickle to 80%, hammer to 70%, bow grip to 55%, and the previously narrowed lower rod grip remains 55%. Each blends back to the unchanged source geometry away from the grip. Original triangle topology, UVs, colours and non-grip proportions remain intact; normals account for the deformation. The bow's limbs face away from the torso. The quiver sits 5.5 cm closer to the back than the initial preview.

New tests check the actual shaft against the finger-cavity plane and centre over multiple Idle/Walking phases, handle thickness, non-accumulating updates, empty/opposite-arm restoration, continuous motion, DNA refits, malformed pose bindings and unmodified Attack/Native neutral. Updated visual evidence uses final-*.png, grasp-motion-bounds.json and palm-measurements.json alongside the interactive review. Initial review images are retained as records of the earlier fit.

Modern handling references used for grip/contact and scale only, not as evidence of occupation-specific Viking technique:

- [NIOSH/CalOSHA hand-tool selection guide, hosted by OSHA](https://www.osha.gov/sites/default/files/publications/OSHA3213.pdf).
- [World Archery coach manual](https://extranet.worldarchery.sport/documents/index.php/Coaches/Accreditation/Coaching_Levels/MANUAL_COACHING_LEVEL_1.pdf).
- [Powerhouse Collection sickle with measured blade and handle](https://collection.powerhouse.com.au/object/249189).
- [Shimano rod holding examples](https://fish.shimano.com/ja-JP/content/beginners/fishingtackle/rod/index.html).
