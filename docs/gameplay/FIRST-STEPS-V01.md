# First steps — compatibility and current journey

The optional guide mechanics delivered in #263 are retained. Their current
player-facing layer is [The Founding Journey v0.1](FOUNDING-JOURNEY-V01.md):
Chapter 0 UI Basics & Navigation (#325), followed by the three authored settlement,
discovery and conflict chapters from #270. Every chapter is independently available.

Chapter 0 reuses the existing selection, panels, map, menu and clock controls.
After **Guide me**, the Journey collapses to a small progress chip and one
concise callout anchored beside a live control or panel. An arrow and subtle
halo identify the target; actual player actions move the callout through each
lesson's substeps. **Show me** focuses or reveals an existing entry, rather than
performing the exercise. Programmatic card opening and refresh do not count as
tour actions. The regular guide keeps the longer explanations, all four chapter
tabs and the Chapter I–III objective checklists.

The callout follows its live DOM target across panel changes, scrolling and
responsive reflow, within viewport and safe-area bounds. A missing or clipped
target gets a visible-entry or informative fallback. The world and highlighted
controls remain usable: there is no screen dimming, modal tour or input trap.
**Back**, **Skip tour**, **Resume tour** and **Replay basics** remain optional.
Replay basics resets only the six Basics observations/acknowledgments, their
skip/defer IDs and the tour cursor. Chapter I–III progress, legacy watch/evidence
and the campaign's time and playback choice are preserved.

Existing version-1 firstSteps/journey saves remain readable with their previous
chapter and progress. The optional bounded `journey.orientation` array and strict
`journey.tour: { step, dismissed }` cursor do not require migration; absent fields
stay absent on read. New/restarted histories offer Basics first. Continue/import
retain the saved chapter, facts and cursor but keep both guide and tour closed;
the player can reopen the guide and explicitly resume the tour.

In Fjord Play, ordinary New/Restart/Continue/import/load entries stay paused through
readiness, story and either guidance choice until the actual Play control is
used. Only intentional internal view transfer has the documented fenced playback
exception. Got it, Show me and chapter completion never start time.

The original implementation measurements remain unchanged in
[the #263 QA record](../qa/onboarding-263/report.md). The earlier
[Chapter 0 QA record](../qa/onboarding-ui-basics-325/report.md) describes the
previous card/checklist implementation. The owner review on
[PR #326](https://github.com/sidesliders1983/Pillagers/pull/326) identified its
missing contextual tour as a blocking UX gap; those passing technical checks do
not establish acceptance of this anchored revision. New technical/visual evidence
is recorded in the [anchored tour QA](../qa/onboarding-ui-basics-325/anchored-tour/report.md). The Founding Journey contract records the current
predicates and acceptance questions. Owner visual approval and an uncoached
playtest remain open. No automatic merge/deploy.
