# Integration Readiness Note — Environment Pass 4

Decision: **not integration-ready**. Date: 2026-10-08.

- Ground delivery: #67 merged to main as `612da515c176c8cf59c38721043da82da6b990ff`, after successful push and PR CI at `f6a19b224a614e5307a5c33f6bae7f0f08dfccfe`. Pass 4 captures use the same runtime files.
- Selected stack: boona13 water `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159` (MIT); ambientCG Ground037/Ground054 + Poly Haven grass_path_2/mossy_rock (CC0); fourteen exact KayKit Forest 1.0 FREE roles/atlas (CC0); existing Meshy buildings/static body.
- Default Lab quality: Standard. Optional GrassField OFF. Low uses regional colour/roughness without normals and lower water geometry. Compatibility uses historical water; not approved primary-water acceptance. No silent asset fallback or source substitution.
- Owner combined visual approval: **none**. Reference scorecard fails richer crowns, palette cohesion, compact clearing/backdrop depth and warm night atmosphere; water geometry reflections/dock and dusk are missing. The owner accepted merging the material Lab candidate, not the composed mock-up match.
- Performance policy: old laptop timings are diagnostic; a few milliseconds above the unapproved prior proposal do not block Lab delivery. Resource costs and actual samples remain reported. Representative physical mobile, GPU memory and ~10 animated production residents are untested; no target-device guarantee.
- Robustness evidence: fresh ten page reloads have stable counts and zero browser errors. Low changes from 35 to 37 geometries after first exercising Compatibility, then stays stable in cycles 2–10; other quality counts are stable. Paused reload pixels differ and their cause is unconfirmed, so pixel determinism is not passed. Public layer/day-night/zoom/pan/resize/wave controls observed. Navigations exercise teardown, but actual VRAM/visibility/mobile coverage remains open.
- Existing build, character audit and complete tests passed at the Lab delivery head. No gameplay, terrain positions, navigation rules or approved production assets changed in this evidence pass.

Manual review: open Environment Lab, seed 1983; choose Standard then Low; pause waves/wind; leave Optional GrassField OFF; inspect Shore/Village/Forest near and far in Day/Night. Compare against hosted REF-A/REF-B crops using exact manifest poses. Switch each layer independently; Compatibility is labelled fallback. Report visual approval by date, exact commit and captures, not a general acknowledgement of CI.

Next bounded decisions: native daylight HDR/contact-lighting comparison, KayKit/EZ-Tree crown comparison, authored fjord/backdrop/dock source and water reflection treatment. No new shader, generated scenery, renderer migration or production substitution is authorized by the scorecard alone.

Rollback: no #60 rollout occurred. Production Fjordside retains the existing terrain/scenery. Future integration must be a separate commit/PR, so rollback can revert activation while preserving sources and evidence.
