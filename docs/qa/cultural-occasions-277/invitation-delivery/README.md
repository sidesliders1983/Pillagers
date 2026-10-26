# Invitation delivery and adapter compatibility

This qualification follows the owner-reported missing wedding question on LAN 5190.
It does not change the wedding rules, replay the seed search, or rewrite V2 evidence.

Two separate faults were established:

- The development server cached old FjordPlay, price and Core transforms because a
  broad `**/scratch/**` exclusion also matched its worktree parent. After the root-scoped
  exclusion and restart at `1bb927d`, all eight checked served source maps matched disk.
  A live cached-module edit then changed the served response without a restart. Raw
  before/after operational records remain in ignored `scratch/review-server/`.
- Reading a real partnership in Activity Center while its invitation was deferred
  incorrectly acted as a ceremony decision. The red regression used the unchanged V2
  pre-source campaign and actual `AttentionView.openEvent`; generic history reading
  suppressed the unanswered question, including after reload, without any Not now click.

The fixed Fjord presentation sidecar stores a per-history cursor and unresolved real
source IDs. It consumes appended canonical events, preserves unanswered questions before
suspension, and separates explicit decisions from notification read status. Actual wedding
receipts, expiry and no-longer-current partnerships remove questions. Temporary stock or
attendance restrictions do not silently decline them. Legacy sidecars initialize once from
still-unread eligible sources; they do not replay all already-read history. No-pending and
disabled refreshes avoid history/attendee scans. No new Core state, rule, RNG call or payment
is introduced by the presentation metadata.

## Frozen inputs and current qualification

The V2 manifest, protocol, ordered search, runner, checkpoints and raw observations remain
unchanged. Its original strict source verifier includes FjordCampaign and SharedSettlement;
those two adapters now differ, so the historical verifier is not claimed to pass at the new
head. It was last verified with the original adapter bytes at `1bb927d`.

[qualification.json](qualification.json) pins current normalized source/runner/test hashes
and the original manifest hash. Exactly two of V2's 175 dependency files changed, both
presentation adapters; all frozen Simulation Core files and rules remain identical. The
new helper/controller and test sources are pinned separately. The recorded base Git head
and dirty list are provenance; later commits with identical measured source bytes need
not retain that base head.

Executed observations:

- Both original checkpoint byte hashes and canonical Core hashes match V2 exactly;
  full SharedSettlement roundtrips preserve their Core.
- The real +1 Year action still produces event-28 at year801/tick950, 38 Food/5 Materials,
  canonical SHA-256 `b4406e4ea0c6b59e997056b461b11d986ffbd050f98df07c3b1b582d7ba04c2b`.
- Reading that source and saving/reloading retain the unresolved question. Its actual
  quote is 24 Food + 1 Material for eight attendees.
- The accepted public command leaves 14 Food/4 Materials and a burning campfire. Its
  canonical serialization exactly matches the full-history Core command; the genuine
  receipt removes the question across another restore.

Reproduce without rewriting evidence:

    node docs/qa/cultural-occasions-277/invitation-delivery/verify.mjs --verify
    node --max-old-space-size=1024 --test tests/wedding-invitation.test.mjs

The DOM regression additionally invokes the actual Attention view and double-clicks Confirm
while testing campaign replacement, explicit dismissal, invalid imported metadata, real
receipts and expiry. Source parity, DOM and headless results do not establish rendered
appearance, physical-device comfort, listening quality or sustained GPU/memory cost.
