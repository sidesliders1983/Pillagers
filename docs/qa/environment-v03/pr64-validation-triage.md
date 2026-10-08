# PR #64 validation triage — 2026-10-08

Candidate head f64a36ff3c9111933110363c38caeb45c33a9437 is not releasable. GitHub pull-request workflow run 37782092790, validate job 113327462486: build passed; character validation failed; tests skipped. PR remains draft. Its base is the still-open PR #62 branch, codex/ground-terrain-pass2; it is not a PR directly into main.

The exact first failure is garment/cream-tunic LOD2: non-manifold edges (71). A separate complete local suite run also failed. Focused checks identify these distinct groups:

- Published legacy cream-tunic topology: 71 non-manifold edges. Both positive garment-domain/ownership registry tests encounter the real invalid asset.
- Actual worn legacy ensemble exceeds the existing 4,400-triangle budget on the neutral Golden Character.
- Final legacy garment bind frame disagrees with the actual neutral body: cream Hips differs by 0.01220584006827803 metres. Replacing metadata alone would not physically transport the source.
- Seven attachment-contact-volume cases construct a degenerate synthetic body mesh; production closed-body contact guards correctly reject it before the assertions run. The fixture needs a valid closed oriented source while preserving contact-zone assertions.

The affected public clothes, bind-frame module, validator and contact test are byte-identical to main c8215ef according to git diff. These are inherited failures, not a reason to approve the candidate. No guard, fixture or published asset was changed by this triage.

Existing ignored legacy diagnostics show that this is a substantive source repair: cream has a bounded candidate face ledger; long-dress and mantle-tunic still have unresolved source panel ownership/contacts. Passing topology alone would not certify source preservation, atlas ownership, binding, worn motion or fit budgets. Blind face deletion, epsilon separation, fabricated bind tables, increased budgets or skipped legacy assets are not appropriate repairs.

Release decision: HOLD. Owner has been asked whether to prioritize this separate character repair before merging #64, or proceed with #63 independently while #64 remains draft. #63 is Ground Materials v0.4 and explicitly permits sourced albedo with native per-region baking; it does not repair character assets. No merge has occurred.
## Owner-directed resolution

Owner chose character validation first, then explicitly withdrew the old clothing for complete redevelopment. The three exports were archived byte-for-byte outside public/ and removed from actual runtime discovery and default assignment. Generic garment contracts remain tested with declared technical fixtures; no geometry/fit budget or topology threshold was relaxed. Contact fixture topology was corrected. Source receipt hashes now survive Windows checkout. Existing Lab previews are explicitly audited in CI, remain previews, and strict no-preview validation still rejects them.

Local build passed. Complete suite: 417 tests, 416 passed, zero failures, one existing optional fixture skip. Full character audit passed: 16 active assets / 32 GLBs, 12 Golden Characters, 15 modules, Idle/Walk/Run and World. Remote current-head CI must pass before ready/merge.
