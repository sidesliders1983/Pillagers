# Integration readiness note — #60

- Candidate scene/render implementation: 96b4d65784b46120c38b26eb70721adc20ae5680 in draft PR #64.
- Ground/water predecessor: PR #62, ground revision 185097172ae9fcaae1d4557d60a140a8de32274f; sourced #56 boona13 water retained.
- References and KayKit FREE source lock: de91046; exact original hashes/crops and fourteen authored role selections are repository-hosted.
- Approved combined stack commit: **none**. Owner acceptance: **pending**.
- Optional GrassField: off by default; sparse secondary detail only. No integration approval for turning it on.
- Open visual gaps: richer crowns, ground close/normal-distance readability, source/composition for distant fjord walls, complete dock/background, warm night/dusk lighting and scene-geometry reflections.
- Hardware: 24 real Intel HD 630 runs recorded; proposed budgets need confirmation. Low forest p95 is 33.4ms in three candidate runs; a 33.3ms proposal is not declared met. Mobile/visibility and full production ten-person workload remain pending.
- Lifecycle: ten reloads and ten quality cycles completed with stable counts within each sequence; zoom/pan/resize/resume observed. One initial readiness timeout remains unexplained; real visibility/mobile and VRAM validation remain pending.
- CI: current #62/#64 builds pass; Character contracts fails before tests on inherited cream-tunic LOD2 non-manifold edges (71). No character validation weakening or unrelated mesh repair is included.

**Decision: do not integrate #60 yet.** Production Fjordside and /play scenery remain on their existing stack. When a reviewed stack is approved, integrate through a separate commit/PR so rollback can revert that integration without removing source provenance or developer-lab evidence. There is no production rollout to roll back in this candidate.
