# Runtime evidence — #297

Actual agent browser attempts on 29 October 2026, isolated local production build.
[Journey/empathy maps](../journey-empathy-maps.md) explain outcomes and limits;
[build identity](build-identity.json) records the source/export difference and bundle
hashes. [Evidence manifest](evidence-manifest.json) records file hashes and actual
image dimensions. No source or campaign state was edited to obtain an outcome.

| Evidence | Recorded state |
| --- | --- |
| [01](01-start-desktop.jpg) | Clean normal desktop start; technical entry and overlay preference exposed, default Off. |
| [02](02-explicit-diagnostics.jpg) | Explicit `diagnostics=load`; test wording and Back to normal play. Test execution/report generation not attempted. |
| [03](03-loading-founding.jpg), [04](04-founding-over-world.jpg), [05](05-onboarding-choice.jpg) | Real founding handoff and optional Founding Journey. Filename 03 is a capture label, not proof of loading duration. |
| [06](06-game-menu-desktop.jpg) | Normal desktop hamburger; save actions below the visible first view. |
| [07](07-work-consequence.jpg) | Actual work assignment: Niilá becomes Woodworker. |
| [08](08-expedition-quote.jpg), [09](09-expedition-order-paused.jpg) | Actual 8 Food quote and committed paused order. |
| [10](10-family-tree-person.jpg) | Actual Leofgifu Family Tree/card/partnership. |
| [11](11-expedition-return-reason.jpg), [12](12-expedition-historical-detail.jpg) | Route-blocked return and Completed summary; historical detail. No successful sighting. |
| [13](13-save-local-result.jpg), [14](14-restored-local.jpg), [15](15-returning-start.jpg) | Save success, restored paused state and returning entry. |
| [17](17-recovery-narrow.jpg), [18](18-imported-before-continue.jpg), [19](19-import-restored-narrow.jpg) | Start-file import selects candidate, then actual Continue restores in narrow Horizon layout. |
| [20](20-game-menu-narrow.jpg), [21](21-personal-details-narrow.jpg), [22](22-start-narrow.jpg) | Narrow game menu, compact-to-full personal details and normal start. |
| [23](23-opt-in-performance-narrow.jpg) | Deliberately enabled Compact overlay at start; then switched Off. |
| [24](24-start-landscape.jpg) | Start at requested 852×393. No coarse-pointer or actual touch claim. |
| [25](25-prototype-import-candidate.jpg), [26](26-prototype-overview.jpg) | **Separate throwaway prototype**, not game runtime evidence. Four guided model walkthroughs manually traversed. |

Available `.txt` siblings are accessibility snapshots with trailing whitespace
trimmed for review; original capture hashes and normalization are recorded in the
evidence manifest, and originals are preserved in ignored local scratch. Native accessibility
labels in the open header-menu subtree were incomplete on this provider; visible
screenshots and DOM snapshots were used to confirm those controls, rather than
claiming the blank labels were proven game accessibility defects.

`campaign-2089668634.json` is the real downloaded Fjord export used for import.
It contains fictional game identities, not personal user data. No invalid-file,
storage-failure or full save-equivalence certification is claimed.

Requested sizes are recorded separately from document content and screenshot
pixels. Narrow UI was mouse/keyboard automation, not a physical iPhone or touch
emulation. One transient frame immediately after resize (16) is preserved in local
scratch, not used as evidence. No screenshots were fabricated from source.

Artifact hashes identify committed bytes. Scoped attributes keep runtime JSON/TXT
and wireframe SVG line endings at LF across checkouts. Source-local byte hashes
remain separately labelled in the source manifest.
