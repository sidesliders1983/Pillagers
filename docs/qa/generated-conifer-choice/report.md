# Generated conifer choice — follow-up to PR #73

The generated Environment Lab now retains both approved Conifers choices. The previous controller disabled the selector and forced KayKit even when EZ-Tree was selected. The fix reuses the cached approved EZ-Tree Large resolver, records the choice in the blueprint and replans scenery/navigation using actual source crown dimensions.

## Evidence

[Visual comparison](review.html) pairs seeds 17 and 91 at Village and High overlook cameras. Both sources use the same stored geography, scale contract, native renderer and sun20-front lighting (sky fill 1), Standard quality, no HDR, no fog and paused movement/waves. The eight captures and their actual camera/source/renderer metadata are in [results.json](results.json). The captures show the detailed EZ-Tree crowns replacing the simple KayKit crowns; undergrowth and source houses retain their existing appearance. No broader northstar visual signoff is claimed.

The pinned EZ-Tree Large source is unchanged: source revision dcf309bd86bd521083d9c70f01f2de45fdc7c457, model SHA256 ba3e7e52d6fccb55d9847b02d999861597cc87d41f8548e5f59ebb21a1c85fef. Model/resource hashes are verified by scripts/prepare-pine-footprints.mjs. Normalized conifer role heights are 10.774, 6.943 and 5.274m; crown radii are 4.800, 3.093 and 2.350m before seeded scaling. EZ-Tree therefore cannot safely reuse the KayKit radii of 2.532, 1.893 and 1.462m. Source geometry is not simplified or altered.

All ten fixed review seeds accept EZ-Tree with bitwise repeatability and unchanged terrain versus the original KayKit generator. Seed 17 has 26 EZ-Tree conifers versus 47 KayKit; seed 91 has 42 versus 67. Counts reflect wider crowns and the unchanged bounded candidate search, not a new population/resource rule.

Browser checks cover the enabled selector after generation, honoring the initial EZ-Tree choice, switching in both seeds, exact full world export/import, Standard/Low preserving the blueprint, original source-free saves retaining KayKit, and restoration of reference Fjordside. No console/page/HTTP errors occurred. Three repeated KayKit → EZ-Tree cycles settled at 41 geometries, 103 textures and 71 draw calls (including shadow passes) in the same view. This bounded resource check is not a proof of unlimited-session memory behavior.

Renderer snapshots include averaged frame timing at capture time, triangles and draw calls; they do not include raw individual frame intervals or a controlled performance benchmark. EZ-Tree adds visible geometry, so these diagnostic observations must not be read as equivalent rendering cost. Previous world-generation-v01 reports remain unchanged historical records.

## Validation

TDD first reproduced the missing saved source through the public blueprint contract, then reproduced the disabled generated-world dropdown in native Edge. The source-bound clearance, deterministic replay, save/load and unchanged-geography assertions pass. A newly written arbitrary >30 tree assertion was corrected after issue #70 confirmed no fixed tree-count acceptance threshold; every existing regression check and actual placement/route requirement remains intact.

Source formatting was reviewed manually; this repository has no configured formatter. Full test/build/character-validation outcomes are recorded in the PR description after completion. Production adoption still requires the existing owner visual review.
