# Throwaway navigation-state prototype — #297 / #298

Question: does progressive help, separate replacement review and explicit import
activation preserve the player's session intention before menu implementation?

Open `menu-flow.prototype.html` by double-clicking it. It is one self-contained
file; no server, dependencies, persistence, external network or game code.

This is the logic/state branch of the explicitly requested prototype skill. It
explores navigation decisions rather than new graphical styles. Do not merge the
shell into main or use it as proof of real save safety.

Manual browser walkthroughs completed on 29 October 2026:

- Pre-start Help → Diagnostics → Back → Back → Continue reaches World, paused.
- Menu close and New arrival → Cancel keep campaign, selection and paused clock.
- Start-file import selects a candidate; Continue activates it in the model.
- Original-founding replay requires an explicit replacement confirmation.

These are model observations, not tests of production code or independent-player
approval. The real game audit is PR #312. Its source and journey/empathy maps own
the evidence. Verdict: the modeled invariants are inspectable; owner evaluation
of clarity is still pending. No production logic has been adopted.
