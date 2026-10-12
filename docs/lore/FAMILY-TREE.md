# Family Tree · #119 reuse and presentation contract

The second tab belongs to the existing shared Clan Book reader on `/play` and `/fjord-play`. Story chapters, their selector and factual overview stay together in the first tab. This is the current loaded campaign's family history, not the genealogy reconstructed at a selected old chapter.

| Concern | Source | Consumer / boundary |
| --- | --- | --- |
| Founders | `landing.founderIds`, recorded `FoundingPartyLanded` membership | All original founders on one top row, including dead/departed/single/childless people. No invented common ancestor. |
| Identity | `Identity.personaIdentity`, present/deceased registry and archive | One canonical node per person; technical IDs only in provenance. |
| Parentage | Canonical `parentIds` and supported birth records | Two-parent descent; reverse child links derive from the same parent records. Household/caregiver membership is not parentage. |
| Parent roles | Known parent identity's recorded sex under Core human fertility semantics | Mother/father only when unambiguous; never infer from array position. Otherwise Parent / incomplete reference. |
| Partnerships | Current canonical partnership plus founding/formed relationship records and recorded former partner at death/transfer | Preserve historically qualifying people. Distinguish current, ended-by-death/departure, and historical status not observed. No marriage label. |
| Community / external identity | Present people, actual founders and recorded local birth/partnership/death/arrival/departure | Imported external ancestors can be last-known relationship references, not automatic admission of their entire settlement ancestry. |
| Age | `PersonaAge` for present/deceased people; explicit departure date for departed people | No use of stale `DNA.age`. An external archive without an observation date has unknown observed age. |
| Occupation | Current assignment; recorded death work / archived snapshot | Present occupation versus work at death / last-known work stay explicit. |
| Book lifecycle | `ClanBookReader`, shared session, campaign epoch | One overlay, safe Close, tab/passage navigation and stale-campaign guards, without altering pacing/Core. |
| Personal history | #122 shared query and disclosure | Reused in selected-person details; it does not grant family-tree admission. |

Admission: all founders are retained. Other community people need actual parent-child or partnership significance; a recorded arriving family or an independent newcomer family qualifies. A lone unrelated worker/helper/expedition member does not. Once qualified, recorded family connections preserve historical membership in that save. Recorded local partnerships and births can establish historical membership when older departure metadata is absent; the later observation date still remains unknown. Known external children can be readable relationship references without being admitted as diagram nodes. Rollback/new campaign rebuilds inclusion rather than carrying a viewed future forward.

Layout: founder membership is pinned to row zero. Other children lie below their deepest included parent. Independent families have a distinguished root row rather than invented founder ancestry. A newcomer without included parents can align with a connected partner where that does not conflict with descent. Within a row, children group near the recorded parents’ columns, with birth/identity tie-breaks. Parent connectors and dashed partnership connectors differ; descent curves have no invented shared ancestor bar. Missing/self/cyclic ancestry is diagnosed and never silently corrected in Core; incomplete/external relatives have textual references.

The graph is derived/rebuildable presentation data. Event metadata is indexed incrementally, topology is rebuilt only for family-relevant revisions, and cards are updated for real year/work/status changes. The tab is lazy. Selection, card focus and diagram scroll survive harmless updates. A new chapter can be indicated while the tree remains open without switching the tab or stealing its selection.

No relationship, fertility, care, naming, admission score, portrait, model, economy or saved genealogy mechanic is added. Settlement names remain future scope. Older missing history is not back-engineered, per the owner's 12 October clarification.
