# Throwaway flow prototype

The explicitly invoked prototype skill (`C:/Users/Devoteam/.codex/skills/prototype/SKILL.md`)
was applied to the navigation-state question: can progressive help, replacement
review and import handoff preserve the player's intention? This is the logic-flow
branch of that method, not a request for radically different visual styling.

The standalone HTML is kept **outside this PR/main**, on
[`codex/prototype-menu-flow-297`](https://github.com/sidesliders1983/Pillagers/tree/17ee56fcdb00df6b858d8c67994a58306d5e3f0a/docs/ux/alpha-297/prototype).
Open `menu-flow.prototype.html` there by double-clicking; no installation/server.
Local review: `http://127.0.0.1:5192/menu-flow.prototype.html` while the audit preview runs.

Four guided browser walkthroughs were manually exercised: pre-start diagnostics
and back, paused close/replacement cancel, start-file import candidate versus
Continue, and explicit founding replay. Model state stayed visible after each
step. It has no persistence, real save commands, Core calls or automated tests.

**Verdict:** the proposed transition invariants are inspectable and behaved as
modeled in these walkthroughs. Owner assessment of clarity remains pending; no
usability validation or production implementation is claimed. The real-game
[journey/empathy maps](../journey-empathy-maps.md) remain the evidence basis.

Screenshots [25](../runtime/25-prototype-import-candidate.jpg) and
[26](../runtime/26-prototype-overview.jpg) are explicitly prototype evidence.
No prototype shell or reducer is adopted into game code in this audit.
