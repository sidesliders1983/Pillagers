# Item-level menu inventory — #297

Source inventory only. No browser visibility, device behavior or usability result is claimed.
All future menu implementation belongs to #298. Exact selectors, audience/context, source anchors and hashes are in [menu-inventory.json](menu-inventory.json).
Normal start, game menu, recovery/failure, deliberate diagnostics and injected controls are separate states.

## Start

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| E01 · Saved source / season / year / Seed | Displays selected recovery source, calendar and seed. Only selected-save summary; otherwise availability guidance. | player; advanced player | Continue summary; seed in save details — regroup | [runFjordEntry summary](../../../src/fjord-play/FjordEntry.ts) · Lead with the campaign and date; retain seed for reproducibility. |
| E02 · Storage or damaged-save warning | Warns about unavailable browser storage or unreadable preserved data. Only genuine source warnings/damage. | player | Start / recovery, immediately visible — keep | [readRecoverySources → warning text](../../../src/fjord-play/FjordEntry.ts) · Never hide recovery risk behind diagnostics. |
| E03 · Continue campaign / Test saved campaign | Prepares the selected campaign; diagnostic mode measures it without activation. Disabled without a selected valid save; diagnostic wording only in explicit mode. | player / tester | Primary Continue; technical version under Support — keep; gate technical variant | [waitForChoice → CampaignStartAttempt(kind=continue)](../../../src/fjord-play/FjordEntry.ts) · Keep continuation clear and preserve read-only test behavior. |
| E04 · New campaign — same founders / Test original arrival | Validates restartProposal and replays original founding; diagnostic variant does not activate. Needs valid founding data; replacement confirmation when applicable. | player; tester variant | New game → Replay original founding — regroup | [restartProposal → CampaignStartAttempt(kind=restart)](../../../src/fjord-play/FjordEntry.ts) · Legitimate replay choice, not a developer cheat; avoid three competing primary starts. |
| E05 · New scenario / Test a new scenario | Draws a fresh campaign seed; initializes new people/history from validated geography pool. Always offered; seed differs from available saved seeds, island may repeat. | player; tester variant | New game → New arrival — rename; regroup | [drawSeed → CampaignStartAttempt(kind=new)](../../../src/fjord-play/FjordEntry.ts) · A new seed does not guarantee a geographically unique island. |
| E06 · Recover or import a campaign | Opens existing recovery candidates and file import without activating an invalid file. Normal and diagnostic shell; existing data protected. | player | Load game / file; preserve Recovery wording for damage — rename; regroup | [chooseSettlementRecovery](../../../src/fjord-play/FjordEntry.ts) · Separate ordinary loading from error repair while reusing the recovery owner. |
| E07 · Run loading diagnostics | Sets diagnostics=load; subsequent choices measure preparation and stop. Shown outside diagnostic mode, including normal shell. | technical tester | Support & diagnostics → Run loading test — gate | [setDiagnosticMode(true)](../../../src/fjord-play/FjordEntry.ts) · Keep deliberate access without making a load test a normal start action. |

## Start diagnostics

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| E08 · Back to normal play | Clears diagnostic mode and returns to ordinary choices. Only explicit diagnostics=load state. | technical tester | Technical support → Back to normal play — keep | [setDiagnosticMode(false)](../../../src/fjord-play/FjordEntry.ts) · Test-only mode needs a clear escape. |

## Start confirmation

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| E09 · Cancel | Returns without replacing the active campaign. Replacement confirmation for non-continue choices when saved/damaged data exists. | player | New game replacement review — keep | [waitForChoice → false](../../../src/fjord-play/FjordEntry.ts) · Preserve safe default focus and non-destructive cancellation. |
| E10 · Start new campaign | Confirms replacement; activation remains fenced until preparation succeeds. After explicit replacement review. | player | New game replacement review — keep | [waitForChoice → true; attempt.activate](../../../src/fjord-play/FjordEntry.ts) · Keep late activation and manually saved checkpoints. |

## Recovery

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| R01 · Use / Restore saved source | Selects one valid existing recovery candidate. One per valid candidate; source and date shown. | player | Load game → Saved on this browser — rename; keep | [candidate button → finish(candidate.text)](../../../src/fjord-play/CampaignRecovery.ts) · Make storage scope clear; do not discard alternate recovery candidates. |
| R02 · Import campaign | Reads JSON, checks size and inspectSettlementSave before returning the candidate. File picker; invalid input leaves prior saves intact. | player | Load game → Campaign file — rename; keep | [file change → inspectSettlementSave → finish(text)](../../../src/fjord-play/CampaignRecovery.ts) · Portable-save fidelity remains #284; reuse validation. |
| R03 · Download source recovery file | Downloads preserved unreadable source text. Only damaged candidates. | player; support | Recovery problem state — keep | [damaged source Blob download](../../../src/fjord-play/CampaignRecovery.ts) · Preserve evidence and player-owned progress even when invalid. |
| R04 · Back to start menu / Start a new campaign | Returns null to caller; label depends on entry context. Recovery screen; this controller has a Back button but no Escape-key binding. | player | Load game → Back — keep | [finish(null)](../../../src/fjord-play/CampaignRecovery.ts) · No premature replacement from a back action. |
| R05 · Missing storage / source explanation | Explains source availability, import errors and Core-only recovery limitations. Only relevant condition or error. | player | Recovery status — keep | [status and candidate.metadata](../../../src/fjord-play/CampaignRecovery.ts) · A Core-only copy must not be sold as full scenery/book recovery. |

## Loading-test result

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| L01 · Download diagnostics JSON | Downloads the completed or stopped load-test report; automatic download is also attempted. Explicit diagnostic result only. | technical tester | Support → Loading-test result — keep | [showDiagnosticResult/save](../../../src/fjord-play/FjordEntry.ts) · Keep local evidence and manual download fallback. |
| L02 · Run again | Repeats diagnostic preparation without activating a campaign. Diagnostic result only. | technical tester | Support → Loading-test result — keep | [showDiagnosticResult → true](../../../src/fjord-play/FjordEntry.ts) · Do not route to ordinary simulation start. |
| L03 · Back to start menu | Returns to the start flow after diagnostics. Diagnostic result only. | technical tester | Support → Loading-test result — keep | [showDiagnosticResult → false](../../../src/fjord-play/FjordEntry.ts) · Preserve a clear mode exit. |

## Start failure

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| F01 · Try again | Retries the same startup attempt. Campaign preparation failed. | player | Failure recovery — keep | [startup catch → retry=true](../../../src/fjord-play/FjordEntry.ts) · Do not reroll the campaign to hide a load failure. |
| F02 · Back to start menu | Leaves failed preparation with prior saves preserved. Campaign preparation failed. | player | Failure recovery — keep | [startup catch → retry=false](../../../src/fjord-play/FjordEntry.ts) · Required safe escape. |
| F03 · Export prepared campaign | Downloads a prepared candidate when activation/storage failed. Only when a prepared text exists. | player; support | Failure recovery → Download recovery campaign — rename; keep | [prepared text → download](../../../src/fjord-play/FjordEntry.ts) · Do not hide genuine progress recovery under a debug gate. |
| F04 · Save loading diagnostics | Downloads last load report and displays stage/attempt context. Only when a last report exists. | player; technical support | Failure recovery → Technical details — regroup | [lastIslandLoad → download](../../../src/fjord-play/FjordEntry.ts) · Keep error details available on demand at the failure. |

## Game menu

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G01 · Nature asset credits | Opens existing wetlands attribution text in a new tab. Always in menu markup. | player | Help & credits → Nature assets — move | [existing href /game-assets/wetlands/ATTRIBUTION.txt](../../../src/fjord-play/FjordHeader.ts) · Preserve attribution access without making it a main session task. |
| G03 · Clan Book | Opens existing ClanBookReader; lower-navigation button forwards to it. Game session; same reader also reached from events/relatives. | player | Primary Clan Book in established navigation — move; preserve forwarding handler | [ClanBookReader.menuClick; #fjord-book forwarding](../../../src/fjord-play/FjordPlay.ts) · Remove redundant placement only after all canonical destinations remain reachable. |
| G04 · Expedition groups | Closes the game menu, opens management, clears the selected entity and refreshes the existing ExpeditionPanel. Game session; established Expeditions navigation also exists. | player | Primary Expeditions in established navigation — move; preserve handler | [FjordPlay click → showManagement(true), shared.select(null), expeditions.refresh](../../../src/fjord-play/FjordPlay.ts) · The established navigation opens FjordInterface instead. These are different routes; consolidate only after ability/state parity review. |
| G05 · Quality | Sets presentation quality and renderer/world/dressing settings. Low / Standard; not a simulation rule. | player | Settings → Graphics — regroup | [quality change → resolvePresentationQuality / world.setQuality](../../../src/fjord-play/FjordScene.ts) · An ordinary player setting, not diagnostics. |
| G06 · HDR lighting | Toggles optional daylight environment lighting and status. Presentation only; current default off; load failure reported in status. | player | Settings → Graphics — regroup | [syncHdr; FjordHdrLighting](../../../src/fjord-play/FjordScene.ts) · Keep current option and truthful loading/error status. |
| G07 · Local effects | Changes local rain/snow/fire effect quality. Off / Low / Normal; reduced motion constrains particles. | player | Settings → Graphics / motion explanation — regroup | [effects change; CampfireEffect / precipitation](../../../src/fjord-play/FjordScene.ts) · Keep simulation fuel/weather semantics separate from visuals. |
| G08 · Keep screen awake / Allow screen sleep | Requests or releases an optional browser wake lock/fallback. Gesture and platform support; suspended while away. | player | Settings → Display — regroup | [ScreenAwakeControl.click / acquire](../../../src/ui/ScreenAwakeControl.ts) · Useful touch option with honest pending/error state. |
| G09 · Camera views & controls | Reveals camera shortcuts and control help. Always in game-menu markup. | player | Controls & help — rename; regroup | [native details disclosure](../../../src/fjord-play/FjordHeader.ts) · A help destination should not mix diagnostics or campaign replacement. |
| G12 · Loading diagnostics | Reveals last-load report actions. Present as a collapsed disclosure. | technical tester; support | Support & diagnostics — gate; regroup | [native details disclosure](../../../src/fjord-play/FjordHeader.ts) · Deliberate support path, not a normal game-start choice. |
| G15 · Campaign | Discloses saves, developer export, generation inputs and replacement actions together. All current fields share one disclosure. | player; advanced player; developer | Separate Save/Load from New game → Advanced — regroup | [native details disclosure](../../../src/fjord-play/FjordHeader.ts) · Mixing read/recovery, settings and replacement tasks obscures intent. |

## Game menu / header

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G02 · +1 Year | Submits AdvanceWinter through existing playback eligibility. Header on desktop; moved into game menu on Horizon; disabled during Expedition Mode. | player | World & Time; same mobile placement if needed — keep | [playback.canStep → AdvanceWinter](../../../src/fjord-play/FjordPlay.ts) · Legitimate time control, not automatically debug-only. |

## Game menu camera help

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G10 · View settlement | Sets the current camera to settlement view; closes menu. Arrival camera exists after world preparation. | player | Map / Home primary; optional Controls shortcut — keep; clarify primary | [controller.setView(arrivalPose)](../../../src/fjord-play/FjordScene.ts) · Existing Return Home remains the primary orientation action. |
| G11 · View highlands | Sets a prepared highland camera; closes menu. After prepared highland view exists. | player | World & Time → Camera views — move | [controller.setView(highlandPose)](../../../src/fjord-play/FjordScene.ts) · Legitimate exploration/view option; do not automatically classify as QA. |

## Game menu diagnostics

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G13 · Copy last loading diagnostics | Copies last report; clipboard failure directs to download. Handler returns if no report. | technical tester; support | Support → Last loading report — keep | [lastIslandLoad → clipboard.writeText](../../../src/fjord-play/FjordPlay.ts) · Preserve evidence and fallback; verify meaningful unavailable state. |
| G14 · Save last loading diagnostics | Downloads last report JSON. Handler returns if no report. | technical tester; support | Support → Last loading report — keep | [lastIslandLoad → download](../../../src/fjord-play/FjordPlay.ts) · No automatic diagnostics publication or tracking. |

## Game menu Campaign

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G16 · Save locally | Writes the Fjord envelope plus a separate Core fallback into browser localStorage. Current session; storage may fail. | player | Save game → Save on this device — rename; regroup | [SharedSettlement.saveLocal → fjordCampaignKey + sharedCampaignKey](../../../src/fjord-play/FjordPlay.ts) · State browser/device scope explicitly. |
| G17 · Load locally | Pauses and restores local shared campaign using backup/rollback. Requires a valid local candidate; pauses and keeps a rollback snapshot; this handler has no explicit replacement-confirm dialog. | player | Load game → Saved on this device — rename; regroup | [restoreInGame(() => localSettlementText(localStorage))](../../../src/fjord-play/FjordPlay.ts) · Make browser scope and replacement intent clear; coordinate protection changes with #284. |
| G18 · Export Fjord campaign | Downloads FjordCampaign.exportJSON as fjordside-campaign.json. Initially disabled; enabled after startup completes. | player | Save game → Download campaign file — rename; regroup | [this.campaign.exportJSON → download](../../../src/fjord-play/FjordPlay.ts) · Portable save UX/fidelity is #284; this is not the raw Core export. |
| G19 · Export canonical JSON | Downloads raw Simulation Core JSON; differs from Fjord/shared envelope. Current session. | developer; technical tester | Support → Developer data → Core JSON — gate | [this.session.saveJSON → download](../../../src/fjord-play/FjordPlay.ts) · Do not present raw diagnostic data as the normal portable campaign file. |
| G20 · Import campaign | Pauses, reads a file, restores in-game with rollback and clears input. Valid JSON/envelope required; backup made before replacement. | player | Load game → Campaign file — rename; regroup | [file.text → restoreInGame](../../../src/fjord-play/FjordPlay.ts) · Reuse existing protection; #284 owns portable-save work. |
| G21 · Campaign seed | Supplies the seed for New campaign from seed; not an immediate current-world edit. New-campaign input; uint32 rules apply. | advanced player | New game → Advanced → Seed — move; clarify scope | [startNewCampaign(false) → proposal.newCampaign](../../../src/fjord-play/FjordPlay.ts) · Seed choice is legitimate reproducibility/player control, not inherently debug. |
| G22 · Island / validated set / plots | Shows recipe seed and plot count; label hardcodes validated set v1. Existing prepared geography, otherwise legacy explanation. | advanced player; support | New game / save details → Advanced — move; correct label proposal | [campaignFields / campaignIslandPlan](../../../src/fjord-play/FjordPlay.ts) · Current recipe is island-pool-v3; verify intended player terminology. |
| G23 · Enable winter weather | Supplies weather choice to seeded/new-founder and legacy restart branches; original-founding replay uses restartProposal rules. Initialized from current config; not an immediate weather toggle. Replay option parity needs explicit review. | player | New game → Advanced → Weather — move; clarify applies to new game | [campaignFields; startNewCampaign / shared.restart](../../../src/fjord-play/FjordPlay.ts) · Prevent confusing generation options with live graphics/settings. |
| G24 · Enable exploration & rival clan | Chooses physical discovery/rival setup for new/restarted campaign. Defaults checked; query can override; applied during replacement. | player | New game → Advanced → Exploration — move; clarify scope | [startNewCampaign → discoveryEnabled](../../../src/fjord-play/FjordPlay.ts) · Retain legitimate scenario control and saved-campaign rules. |
| G25 · Use the same founders | Changes restart choice and button label between same/new founders. Restart form; does not immediately rewrite people. | player | New game → Replay/new-arrival choices — regroup | [sameFounders change; startNewCampaign(true)](../../../src/fjord-play/FjordPlay.ts) · Keep founding choice explicit and distinct from seeded new campaign. |
| G26 · New campaign from seed | Confirms active replacement and prepares new seeded campaign. Busy fence, replacement confirm and rollback/preparation. | advanced player | New game → Advanced → Start — move | [startNewCampaign(false)](../../../src/fjord-play/FjordPlay.ts) · Do not strand generation behind current-session save controls. |
| G27 · Restart with same / new founders | Confirms replacement; replay/proposal route depends on founders checkbox and legacy geography. Founding data / current geography; busy fence; paused on load. | player | New game → Replay original founding or New arrival — rename; move | [startNewCampaign(true)](../../../src/fjord-play/FjordPlay.ts) · Preserve actual distinctions and replacement safety. |

## Game menu conditional debug

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| G28 · Download recovery diagnostics | Downloads lifecycle trace. Only debugLifecycle query. | technical tester; developer | Support → Advanced recovery diagnostics — keep explicit gate | [trace.snapshot → download](../../../src/fjord-play/FjordPlay.ts) · Existing explicit technical entry, not default-player clutter. |

## Start + Game settings

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| S01 · Sound / Enable sound | Activates or resumes the application-owned audio mixer. Injected into both surfaces; browser gesture required; same movable view. | player | Settings → Sound — regroup | [FjordAudio.enable / restoreFromGesture](../../../src/audio/AudioControls.ts) · Keep normal audio available without a mandatory preflight choice. |
| S02 · Mute | Mutes or enables/resumes the same mixer. Audio preference; no Core save change. | player | Settings → Sound — regroup | [audio.configure / audio.enable](../../../src/audio/AudioControls.ts) · An ordinary setting, not test configuration. |
| S03 · Master volume | Changes master mixer gain. Range 0–1; presentation preference. | player | Settings → Sound — regroup | [input → audio.configure](../../../src/audio/AudioControls.ts) · Preserve gain control and device gesture behavior. |
| S04 · Sound groups | Discloses group volumes. Native details in shared audio view. | player | Settings → Sound → Sound groups — keep | [native details disclosure](../../../src/audio/AudioControls.ts) · Secondary controls should not dominate campaign start. |
| S05 · Ambience | Changes ambience gain. Range 0–1; existing mixer group. | player | Settings → Sound → Sound groups — regroup | [input → audio.configure](../../../src/audio/AudioControls.ts) · Retain the player mix choice. |
| S06 · World | Changes world gain. Range 0–1; existing mixer group. | player | Settings → Sound → Sound groups — regroup | [input → audio.configure](../../../src/audio/AudioControls.ts) · Retain the player mix choice. |
| S07 · Interface | Changes interface gain. Range 0–1; existing mixer group. | player | Settings → Sound → Sound groups — regroup | [input → audio.configure](../../../src/audio/AudioControls.ts) · Retain the player mix choice. |
| S08 · Sound state / sound-pack explanation | Reports actual enable/suspend/failure state; normal pack explanation or explicit QA mode. Status always; synthetic proof/review wording only explicit selected sound mode. | player; tester in QA mode | Settings → Sound; errors visible when relevant — keep; gate QA wording | [AudioControls.refresh; selectFjordSoundPack](../../../src/audio/AudioControls.ts) · Do not claim the current public pack is missing; inspect selected mode. |
| S10 · Debug / Performance overlay | Configures Off / Compact / Details and stored preference. Settings appended even with view Off; saved opt-in or debugPerf=1 can enable overlay. | technical tester; support | Support & diagnostics → Performance overlay — gate; regroup | [PlaytestPerformance.settings / configure](../../../src/fjord-play/PlaytestPerformance.ts) · Overlay Off is not the same as hiding its technical selector. |

## Start + Game settings conditional QA

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| S09 · Playing/fading/buffers/PCM counts | Displays audio proof counters. Only proof mode; blank during ordinary pack. | technical tester | Support → Audio proof — keep explicit gate | [AudioControls.refresh proof branch](../../../src/audio/AudioControls.ts) · Already conditional; not evidence of normal-player metrics by itself. |

## Performance overlay

| ID / current entry | Actual action and context | Intended audience | Proposed location / disposition | Existing handler / justification |
| --- | --- | --- | --- | --- |
| S11 · Freeze / Unfreeze display | Freezes displayed measurements, not simulation. Only enabled compact/details overlay. | technical tester | Performance overlay — keep | [frozen display toggle](../../../src/fjord-play/PlaytestPerformance.ts) · Preserve screenshot evidence without confusing time control. |
| S12 · Options | Discloses technical overlay controls. Enabled overlay only. | technical tester | Performance overlay — keep | [native details disclosure](../../../src/fjord-play/PlaytestPerformance.ts) · Explicit support context. |
| S13 · Move corner | Cycles overlay corner. Enabled overlay only. | technical tester | Performance overlay → Options — keep | [corner preference / paint](../../../src/fjord-play/PlaytestPerformance.ts) · Retain capture placement. |
| S14 · Copy diagnostics | Copies local measurement export with clipboard fallback state. Enabled overlay; clipboard support required. | technical tester | Performance overlay → Options — keep | [PlaytestPerformance.exportJSON → clipboard.writeText; fallback(text)](../../../src/fjord-play/PlaytestPerformance.ts) · Evidence stays on device until user shares it. |
| S15 · Save JSON | Downloads diagnostic measurements. Enabled overlay only. | technical tester | Performance overlay → Options — keep | [diagnostic Blob download](../../../src/fjord-play/PlaytestPerformance.ts) · Do not merge with campaign download. |
| S16 · Screen recording | Records self-reported on/off/not-reported metadata; does not start recording. Enabled overlay only. | technical tester | Performance overlay → Options — keep; clarify meaning | [recording metadata update](../../../src/fjord-play/PlaytestPerformance.ts) · Avoid promising a screen recorder. |
| S17 · View | Switches Off / Compact / Details. Enabled overlay; Off dismisses diagnostic sampling. | technical tester | Performance overlay → Options — keep | [configure(view)](../../../src/fjord-play/PlaytestPerformance.ts) · Keep an obvious exit and disposal. |
