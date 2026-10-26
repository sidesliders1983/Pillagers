# Family Tree · #119 genealogy and #287 presentation contract

The Family Tree stays inside the shared Clan Book on `/play` and `/fjord-play`. It describes the active campaign's recorded family history, rather than the family at a selected old story chapter. Published prose, family admission, Core, DNA, RNG and economic rules are unchanged.

| Concern | Existing source | Consumer / boundary |
| --- | --- | --- |
| Founders | `landing.founderIds` / recorded founding membership | Every original founder remains in the leftmost generation, including single, childless, dead and departed people. |
| Identity and parentage | `Identity.personaIdentity`, `FamilyTree.ts`, canonical `parentIds` and birth records | One node per canonical ID; both known parents retained. Reverse child links come from those same records. Household/caregiver membership is never parentage. |
| Partnerships and historical eligibility | Current partnership plus founding/formed records and recorded former partner at death/transfer | Current, historical and ended relationships remain distinct. No invented marriage or parenthood from a new partner. |
| Age / recorded work | `PersonaAge`, death work and archived snapshots | Living age is current; death age and departure observations stay frozen. Historical cards say Deceased or Departed / last known, with last work, not current employment. |
| Portrait identity | `projectResidentAppearance`, `FjordWardrobe`, `FjordInterface.requestPortrait` | Same DNA/face/age/wardrobe request as Character Cards, including supported historical identities. Unknown identity/age or render failure keeps named initials. |
| Rendering and cache | Existing `CharacterPortraits` and `ResidentPortraitStudio` | One existing Fjord renderer and one shared serial image cache, still capped at 24. No per-card renderer, new face generator or world model. |
| Book / history | `ClanBookReader`, `PersonalHistoryView`, session epoch | Existing Close, tabs, factual relationships, named relative navigation and Personal history; no new book or biography ledger. |

Admission remains #119's rule: all founders are retained. Later people need recorded family significance through actual parentage or partnership. A real arriving family or independent newcomer family can qualify; a lone worker, helper, captive or saga mention cannot. Known external relatives can remain explicit references without importing their entire ancestry. Loaded history is the authority; rollback cannot retain admission from an abandoned future.

## Horizontal layout

The canonical projection remains singular. Its `row` still means genealogical depth and its `column` remains the stable ordering hint. `FamilyTreeLayout` maps that depth to left-to-right presentation columns; generation is never inferred from age or living status.

Founders stay at depth zero. Children are beyond their deepest included parent; an eligible parentless partner can align with its recorded partner where descent allows. Independent roots retain the projection's independent-family placement and explicit card label, without a connector to an invented founder.

The first layout visits generation then canonical ordering. A new descendant takes the first unoccupied vertical slot at or below the rounded mean of its included parents' slots. Existing nodes at the same depth keep their slots during the open campaign, so a birth extends the real line without shifting existing cards. Parentage/depth changes may move the affected card. Load/import/rollback clears these transient anchors and deterministically rebuilds from the active facts; no coordinates or second genealogy are saved.

Solid curves connect the right side of each recorded parent to the left side of the child. Dashed partnership lines use separate gutters. Links across different depths use the header gutter to avoid running through unrelated cards. Every edge comes directly from the existing projection, including both parents, former partners and cross-family links. Missing/self/cyclic records retain the projection's diagnostics and external/incomplete references.

Headers distinguish Founders, successive numbered generations and the **Newest recorded generation**. Newest does not mean currently alive. Every card has its own explicit living/deceased/away/departed status.

## Portraits and navigation

Only visible cards (with a small prefetch margin) request thumbnails through the Character Card API. At most 24 view records are retained; leaving the viewport cancels queued work and releases the view's image reference. Hiding the tab or closing the book disconnects observation and aborts its requests. Obsolete observer callbacks, late portraits, campaign replacement and rollback are guarded by observer identity, cancellation and session epoch.

Fjord Play supplies its existing portrait service. The 2D reader, missing portraits and unknown historic appearances use deliberate initials with the actual person's name; opening the tree never waits for an image. Failed images retain that fallback. Neutral studio lighting and recognition match existing Character Cards, rather than adopting world night lighting.

Cards remain readable at a fixed size, with native two-axis scrolling, mouse dragging of empty space, Reset view and Newest generation controls. No automatic zoom, world camera change or normal-game autoplay is introduced. Selection highlights recorded relationships and reuses the existing details/history. Selection, DOM focus and viewport survive harmless updates and tab changes. World gestures are contained by the existing book.

The family tab uses more of the existing reader. Close stays within safe viewport insets. Short landscape screens put navigation beside Close and initially collapse the selected-person details, preserving room for the diagram. The view is non-modal and never starts or pauses the campaign.

## QA and recording save

See [#287 QA](../qa/family-tree-287/README.md) for before/after images, a short labelled QA pan, measurements, regression coverage and the importable gameplay test save. The save uses actual Core-generated people and life events with accelerated setup rules; normal mechanics are restored before delivery. It is explicitly a recording/test scenario, not a claim of an ordinary unassisted 32-Winter economy run.

No new fertility, partnership, mortality, naming, family-significance, simulation or balance rule is introduced. Settlement naming and a historical timeline remain future scope.
