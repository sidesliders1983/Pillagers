# FjordSide alpha player experience audit — #297

Version 0.1 · 29 October 2026 · source inventory and proposed information architecture.
Parent: [#296](https://github.com/sidesliders1983/Pillagers/issues/296).

**Status: source-inventory phase complete; current-build browser and device journeys
are not performed.** The owner explicitly chose “Werk eerst de broninventaris uit”
when browser use was unavailable. This report does not close #297, authorize #298
implementation or certify external-player readiness. No player UI, Core, RNG,
Lore, save, runtime asset, dependency or gameplay behavior changed in this branch.

## Scope and evidence

The start menu and top-bar game menu were audited first. The item-level result is
[67 classified entries](alpha-297/menu-inventory.md), including injected controls
and their conditional recovery/diagnostic states. The machine-readable
[inventory](alpha-297/menu-inventory.json) records current label/location, selector,
actual action, audience, availability, proposed destination, disposition,
justification, handler, implementation owner, source commit and file hash.

| Evidence | Identity / result | What it proves |
| --- | --- | --- |
| Pinned source | `main` / `4086baac26c6953b879b439546b68f2406ca767a` | Exact source inspected; a separate documentation-only branch starts here. |
| Published identity | `https://pillagers-test.sidesliders.chatgpt.site/site-version.json` reports the same main commit, routes `/` and `/fjord-play` | HTTP metadata observation. It does not independently prove every deployed asset matches source or that a UI journey works. |
| Workspace | `D:/CodexSites/Pillagers/scratch/ui-audit-297`, branch `codex/ui-audit-297` | Isolated from the unmerged marine/recording branch and its LAN playtest. |
| Browser | Local browser use disabled in Work settings; browser inventory empty | No current screenshots, viewports, click counts or device observations were captured. Owner deferred this phase. |
| Historical patterns | Merged [PR #192](https://github.com/sidesliders1983/Pillagers/pull/192), [Horizon report](../qa/mobile-horizon-182/README.md), [integrated report](../qa/integrated-playtest-180/README.md) | Existing Context & Focus/Horizon intent and historical evidence only; not current-build validation. |
| Proposals | Four [annotated wireframes](alpha-297/wireframes/README.md) | Proposed navigation structure, explicitly not game screenshots or implemented controls. |

Source hashes and the observed public version document are retained in the
[source manifest](alpha-297/source-manifest.json). Evidence labels used below:
**S** = source-confirmed; **H** = historical evidence; **P** = proposal/hypothesis;
**U** = unverified current runtime/device behavior. No usability score is invented.

## Start menu — current structure before the proposal

The source unconditionally appends performance settings and the shared audio
controls next to the entry shell (`FjordEntry.showShell`). In ordinary mode,
`Run loading diagnostics` is available; it is not restricted to an already enabled
technical mode. Continue is shown disabled when no valid selected save exists.

```text
FjordSide / selected save source + date + seed / real storage warning
├─ Continue campaign                         [valid selected save required]
├─ New campaign — same founders              [valid founding data required]
├─ New scenario                              [fresh campaign seed; island can repeat]
├─ Recover or import a campaign
├─ Run loading diagnostics                   [normal mode entry]
├─ Debug / Performance overlay               [Off / Compact / Details]
└─ Sound                                     [Enable, Mute, Master, Sound groups]
```

An explicit `diagnostics=load` state relabels the three campaign buttons as tests,
shows Back to normal play and prepares without activation. Reports remain local.
Recovery, failed preparation and replacement confirmation have separate controls;
these must not disappear with the normal-screen cleanup. See E01–F04 and S01–S17.

### Proposed start structure — owner review, not implemented

```text
Start
├─ Continue                                 [only when a valid save exists]
│  └─ useful campaign/date summary; source/seed under details
├─ New game
│  ├─ New arrival                            [new people and seed; validated island pool]
│  ├─ Replay original founding               [same founders/island; eligible saves only]
│  └─ Advanced: seed / existing generation options
├─ Load game / file                          [existing recovery/import owner]
├─ Settings                                 [ordinary sound / display preferences]
├─ Help & credits
└─ Support & diagnostics                     [deliberately opened, secondary]
   ├─ Performance overlay
   └─ Run loading test → result / download / retry / normal-play exit
```

New game must not promise a unique new island: a new seed can select the same
validated geography. Seed and founding replay are legitimate player choices,
not automatically debug controls. A real storage/damage warning stays immediate.
The proposal preserves all current capabilities through classification and routing;
removing one of the parallel primary entries is not permission to delete its action.
Settings placement should not imply that currently unavailable entry graphics
controls already exist: inspect/apply their current owner in #298.

![Proposed desktop start hierarchy, not a game screenshot](alpha-297/wireframes/start-desktop.png)

[Landscape touch proposal](alpha-297/wireframes/start-mobile-landscape.png).

## Game menu — current structure before the proposal

```text
Game menu
├─ Nature asset credits
├─ +1 Year                                  [Horizon only; desktop header otherwise]
├─ Clan Book
├─ Expedition groups
├─ Quality / HDR / Local effects
├─ Keep screen awake
├─ Debug / Performance overlay
├─ Sound / volumes
├─ Camera views & controls
│  ├─ View settlement
│  └─ View highlands
├─ Loading diagnostics → Copy / Save last report
├─ Campaign
│  ├─ Save locally / Load locally
│  ├─ Export Fjord campaign / Export canonical JSON / Import campaign
│  ├─ Seed / geography information
│  ├─ Winter weather / exploration & rival / same-founders inputs
│  └─ New campaign from seed / Restart with same or new founders
└─ Download recovery diagnostics             [only debugLifecycle query]
```

Two important handler distinctions are confirmed in source:

- The ordinary navigation Clan Book button forwards to the existing reader opener.
  That is a shared destination, not evidence of two books.
- The game-menu Expedition groups button opens management, clears selection and
  refreshes `ExpeditionPanel`. The established Expeditions navigation opens
  `FjordInterface`. These are different routes/state transitions. #298 must inventory
  parity before choosing one primary path; merely hiding one button is insufficient.

### Proposed game-menu structure — owner review, not implemented

```text
Game menu                                   [Close / Escape; no implicit clock resume]
├─ Save game
│  ├─ Save on this device                    [existing browser-local checkpoint]
│  └─ Download campaign file                 [existing Fjord export; coordinate #284]
├─ Load game
│  ├─ Saved on this device
│  └─ Campaign file                          [validation, backup and explicit intent]
├─ New game / Replay…                        [replacement review, not live settings]
├─ Settings
│  ├─ Graphics: Quality / HDR / local effects
│  ├─ Sound: enable/mute / master / groups
│  └─ Display: keep screen awake; existing reduced-motion explanation
├─ Controls & help                           [camera views; existing Need help? entry]
├─ Time                                     [mobile +1 Year when needed]
├─ Help & credits
└─ Support & diagnostics
   ├─ Performance overlay / last loading report
   └─ Advanced developer data: Core JSON / lifecycle recovery
```

Keep primary Settlement, Expeditions, Clan Book, Map/Home and Attention in their
established Context & Focus/Horizon places. No new six-button hub is proposed.
`+1 Year` remains a real time action and keeps its expedition restriction.
Generation weather/exploration inputs belong with the campaign they create,
not beside settings that immediately change the currently running scene.

Two proposed destinations need genuine wiring, not a fake button:
**Return to start** has no ordinary current-session menu handler in the inspected
shell; any future entry needs checkpoint/error recovery and explicit clock intent.
**Give feedback** has no configured in-game destination found in the inspected
source. #298 must obtain an owner-configured URL or omit the external CTA. In-game
`.fjord-feedback` is command/status feedback, not a player-feedback collection path.
Neither proposal is represented as already available.

![Proposed game menu in a landscape touch layout, not a game screenshot](alpha-297/wireframes/game-mobile-landscape.png)

[Desktop game-menu proposal](alpha-297/wireframes/game-desktop.png).

## Save/storage and safety contract

| Current capability | Source contract | Audit consequence |
| --- | --- | --- |
| Active-session persistence | `persistSettlement` writes `SharedSettlement.persist()` to sessionStorage: Fjord envelope, pacing and optional presentation sidecar. | Distinguish tab/session continuation from a manual device checkpoint. |
| Save locally | `SharedSettlement.saveLocal` writes the Fjord envelope and a separate raw Core fallback to localStorage. | Rename truthfully; it is not a cloud save or the whole Shared envelope. |
| Export Fjord campaign | `FjordCampaign.exportJSON` includes campaign, recipe/layout, selection, narrative, attention and applicable sidecars. It omits Shared pacing/presentation. | Preserve the file path and coordinate fidelity/round-trip UX with #284. |
| Export canonical JSON | `GameplaySession.saveJSON` serializes Core only. | Technical/developer destination; do not imply portable scenery/book equivalence. |
| In-game local/file load | Pauses, snapshots a rollback candidate, validates/prepares and restores; this load handler has no explicit replacement-confirm dialog. | Review replacement intent with #284; do not claim a dialog already protects every load. |
| New/restart | Explicit replacement confirmation; preparation/activation fencing; original-founding, new-founder and legacy branches differ. | Preserve all safeguards and verify each option's actual effect before relabeling. |
| Menu close | `FjordHeader` handles Escape/outside click; it has no resume command. | Preserve manually paused/running intent; verify in browser after restructuring. |

## Six functional clusters and overlap ownership

| Intent cluster | Current primary entry / context | Known overlap / ownership |
| --- | --- | --- |
| World & Time | Header Play/Pause, year pace, +1 Year; IslandMap and Return Home/camera controls. | Camera shortcuts in game menu are optional secondary access. Keep #194 owner/contracts; #298 owns their menu grouping. |
| Settlement | Settlement directory, resource counters, resident/home/livestock selection; work/build/upgrade context. | No new global management hub. Existing `FjordInterface`, work offers and command review remain. |
| People & Legacy | Resident card → Personal details/relatives/history; Clan Book → Family Tree. | Reuse #198/#287 and current identity/history; do not invent Health/Mood or new family state. |
| Exploration | Established Expeditions navigation → group/crew/eligibility/pack → real destination order and return. | Legacy game-menu management route differs. #298 owns entry consolidation; #299 cannot independently redesign these menus. |
| Chronicle & Events | Attention/Activity Center plus Clan Book Story/Family/Wildlife and real event links. | Menu Clan Book duplicates access to the same reader; preserve event and witness deep links (#216/#287). |
| Game & Support | Entry choices; browser/file save routes; ordinary settings; deliberate diagnostic tools. | #298 owns both menus and immediate destinations; #284 owns portable-save completeness; #260 diagnostics stays available. |

## Five journey maps — source traces, not completed attempts

No clicks/taps or completion times are reported. The following are reproducible
candidate routes for the browser phase, with actual outcomes explicitly U.

| Journey | Entry → source-derived steps | Decision/context and expected canonical result | Exit/recovery and pending observation |
| --- | --- | --- | --- |
| A Arrival | `/fjord-play` → new/continue choice → IslandLoading → real FoundingBook → Guide me or Explore on my own → world. | Guide holds the clock; Explore on my own starts it. Continue/restored games pause. New seed uses existing founding/species/island rules. | Back/retry preserves prior saves; genuine errors stay visible. U: actual clean and returning entry layouts, role comprehension and the story/guide handoff. |
| B Establish | Select an actual resident/home → Personal details or Manage work/build/upgrade → inspect available quote → confirm an eligible ordinary action → observe actual work/home state. | Costs/eligibility come from current offers, not this audit. A free valid work assignment may be an early decision; do not assume a funded farmyard or fabricate Materials. | Existing back/close and stale-offer revalidation. U: affordability/discoverability, touch click-through, selection restoration and visible consequence on this exact build. |
| C Discover | Expeditions → eligible members → actual Food quote → prepare group → map flag/Send group → canonical travel/discovery → focus/Return home. | Current supply rules and mission eligibility apply; no promise of a discovery in a timed first-ten-minute script. | Unconfirmed flag cancellation differs from recalling a departed group. U: competing entry routes, quote comprehension, safe cancellation and discovery handoff. |
| D Connect | Select real resident → Personal details → relative/history or Clan Book Family Tree/real event → return to selected world context. | Use actual known relationships; current founders need not yield a new birth/marriage on demand. | Reader/Family Tree close and focus handling exist. U: orientation, opener focus and selection persistence after cross-surface travel. |
| E Continue | Save on device or download Fjord file → deliberate load/import via existing owner → paused continuation → find feedback if configured. | Distinguish sessionStorage, localStorage, Fjord file and raw Core; no cloud/account promise. | Invalid file keeps recovery feedback; failed restore rolls back. U: successful/failed round-trip fidelity, unsaved replacement warning and feedback discoverability. |

## Findings and priority — separate facts from impact hypotheses

| ID / class | Evidence and specific claim | Journey / owner | Interpretation |
| --- | --- | --- | --- |
| A01 · P1 candidate | S: entry appends the performance selector/audio controls and offers Run loading diagnostics in normal mode. | A; #298 | The mixed starting hierarchy is source-confirmed. How strongly it impedes unfamiliar players is P/U, not measured. |
| A02 · P1 candidate | S: game Campaign mixes checkpoint/file operations, Core export, generation options and replacement actions. | E/A; #298 with #284 | Task-placement confusion is a supported design hypothesis. Keep legitimate seed/year capabilities. |
| A03 · P1 candidate | S: two expedition entries invoke different owners and one clears selection. | C; #298 | Genuine handler divergence; ability/visibility parity and player impact still U. #299 must not redesign the same menu. |
| A04 · P1 dependency | S: no configured Give feedback route found in inspected player shell. | E; #298 / owner | Missing inspected configuration; do not invent a URL, destination or live collection claim. |
| A05 · P2 candidate | S: New scenario and raw seed/source/geography terminology coexist with ordinary actions; geography summary hardcodes validated set v1 while recipe v3 is current. | A/E; #298 | Rename/reclassify after checking context; a new seed is not a unique-island guarantee. |
| A06 · P2 candidate | S: game-menu generation weather/founder inputs have different new/replay/legacy branches. | A/E; #298 | Exact option semantics need a scenario matrix before moving/relabeling; no live weather toggle is proven. |
| A07 · already delivered, retest U | S/H: loading diagnostics disclosure is hidden in ordinary loading; performance overlay defaults Off absent opt-in; diagnostics, onboarding, map and Family Tree owners already exist. | A/D; #151/#259/#260/#263/#194/#287 | Do not reopen accepted loading optimization or build a second tutorial/map/book. |
| A08 · P0 not reproduced | No new crash, save loss, failed essential journey or inability to enter is reproduced by this source-only phase. | All; #151 if a new blocker is reproduced | This is not evidence that no P0 exists. Technical and device acceptance remain U. |
| A09 · not verified | Current desktop/touch layout, hit targets, scrolling/focus, manual-pause preservation, click-through and all five actual journeys. | #297 browser phase; later #300 | No runtime screenshot, successful tap count or physical-device result is claimed. |

## Boundary for follow-up work

**#298** receives the item-level mapping, both before/after structures and proposed
wireframes. It owns normal-vs-support gating, label hierarchy and the immediate
routes in both menus. Coordinate #284 around save-file wording, fidelity and
replacement protection. Keep current diagnostics deliberately reachable and real
recovery warnings visible. Do not move every technically named control into a
hidden developer bucket by default.

**#299 has no selected implementation items yet.** Its required top-three ranking
must come from current runtime observations. Candidates to inspect after the menu
audit are: (1) work/build quote → consequence → return; (2) expedition quote/flag →
discovery/return handoff; (3) resident → family/history → return orientation.
These are checks, not claims of failures or permission for three speculative fixes.
The start/menu duplication in A03 stays with #298.

**#300** still owns uncoached unfamiliar-player evidence and the final external-alpha
Go/Conditional/No-Go gate. Source review and a code/documentation merge do not
establish concept desirability or device readiness.

## Deferred runtime protocol and completion checklist

Use a fresh isolated test origin or protect/export an existing campaign before
replacement. Pin the exact compiled source and served version separately; preserve
storage and save errors. Capture desktop (e.g. 1440×900), coarse-pointer landscape
(e.g. 852×393), portrait fallback and the actual platform/DPR. Emulation is not a
physical iPhone. The current source switches Horizon at max-width 600px or at
max-width 1100px with a coarse pointer; resizing alone may not select touch UI.

Capture both clean normal settings and explicit diagnostic/support states; label
persisted diagnostic preference separately from a first-time default. Attempt A–E
using valid current campaign state, record before/action/after, actual quote/result,
exit/recovery and manual-pause/selection/focus state. Do not coerce RNG or forge a
family, mission or historical event to complete a journey. Recheck last observed
friction on the pinned build; preserve historical reports as historical.

- [x] Pin main source and record public version metadata.
- [x] Source-review start and game menus first, including injected/conditional entries.
- [x] Classify every inventoried entry and map existing handler/owner/proposed location.
- [x] Provide annotated structures, desktop/mobile proposal wireframes and six-cluster overlap map.
- [x] Trace five candidate journeys without invented click counts/outcomes.
- [x] Identify menu ownership and explicit #284/#299/#300 boundaries.
- [ ] Revalidate visibility/actions on current normal and technical served states.
- [ ] Capture current screenshots/video and actual desktop/touch journeys.
- [ ] Rank up to three non-menu problems for #299 from observed failures.
- [ ] Complete #297 acceptance and any subsequent owner implementation decision.

The scope of this revision ends at the owner-requested source inventory. It is a
documentation-only draft for review, with runtime work deliberately deferred.
