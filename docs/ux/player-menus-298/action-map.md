# Item-by-item implementation map — #298

All 67 IDs from the [reviewed #297 inventory](https://github.com/sidesliders1983/Pillagers/blob/c3c6e987e5754d9f4b83bb647923ef99d2053f96/docs/ux/alpha-297/menu-inventory.json) are accounted for below. IDs R01 here are inventory IDs, not #299 journey candidate R01.

Menu grouping is implemented in `CampaignEntryMenu` and `fjordHeaderHTML`; existing engine handlers remain in `runFjordEntry`, `FjordPlay` and their owners. The only new campaign action is an in-game New arrival affordance: after the existing replacement confirmation it draws an independent crypto seed and calls the existing new-campaign handler. Cancel precedes the draw. No Core RNG or rule is changed.

| Audit ID | Before | Implemented destination / disposition | Existing owner |
| --- | --- | --- | --- |
| E01 | Saved source / season / year / Seed | Home date summary; original source/seed in Campaign details disclosure | runFjordEntry summary |
| E02 | Storage or damaged-save warning | Home/recovery warning, immediately visible | readRecoverySources → warning text |
| E03 | Continue campaign / Test saved campaign | Home Continue campaign; technical Test saved campaign only in explicit loading-test mode | waitForChoice → CampaignStartAttempt(kind=continue) |
| E04 | New campaign — same founders / Test original arrival | New game → Replay original founding; existing restart eligibility/reason preserved | restartProposal → CampaignStartAttempt(kind=restart) |
| E05 | New scenario / Test a new scenario | New game → New arrival; same independent seed draw/activation owner | drawSeed → CampaignStartAttempt(kind=new) |
| E06 | Recover or import a campaign | Home Load game → unchanged recovery picker and campaign-file import | chooseSettlementRecovery |
| E07 | Run loading diagnostics | Help & support → Diagnostics → Run loading diagnostics | setDiagnosticMode(true) |
| E08 | Back to normal play | Unchanged explicit test-mode exit / replacement confirmation; same cancellation and activation fence | setDiagnosticMode(false) |
| E09 | Cancel | Unchanged explicit test-mode exit / replacement confirmation; same cancellation and activation fence | waitForChoice → false |
| E10 | Start new campaign | Unchanged explicit test-mode exit / replacement confirmation; same cancellation and activation fence | waitForChoice → true; attempt.activate |
| R01 | Use / Restore saved source | Unchanged recovery screen after Load game; same validation, candidates, downloads and status | candidate button → finish(candidate.text) |
| R02 | Import campaign | Unchanged recovery screen after Load game; same validation, candidates, downloads and status | file change → inspectSettlementSave → finish(text) |
| R03 | Download source recovery file | Unchanged recovery screen after Load game; same validation, candidates, downloads and status | damaged source Blob download |
| R04 | Back to start menu / Start a new campaign | Unchanged recovery screen after Load game; same validation, candidates, downloads and status | finish(null) |
| R05 | Missing storage / source explanation | Unchanged recovery screen after Load game; same validation, candidates, downloads and status | status and candidate.metadata |
| L01 | Download diagnostics JSON | Unchanged explicit loading-test result; same download/retry/back owner | showDiagnosticResult/save |
| L02 | Run again | Unchanged explicit loading-test result; same download/retry/back owner | showDiagnosticResult → true |
| L03 | Back to start menu | Unchanged explicit loading-test result; same download/retry/back owner | showDiagnosticResult → false |
| F01 | Try again | Unchanged genuine startup failure screen; same recovery, retry/back and diagnostic exports | startup catch → retry=true |
| F02 | Back to start menu | Unchanged genuine startup failure screen; same recovery, retry/back and diagnostic exports | startup catch → retry=false |
| F03 | Export prepared campaign | Unchanged genuine startup failure screen; same recovery, retry/back and diagnostic exports | prepared text → download |
| F04 | Save loading diagnostics | Unchanged genuine startup failure screen; same recovery, retry/back and diagnostic exports | lastIslandLoad → download |
| G01 | Nature asset credits | Help & support → About / Credits; also quiet About / Credits on start | existing href /game-assets/wetlands/ATTRIBUTION.txt |
| G02 | +1 Year | Desktop header; Horizon direct overflow beneath Help; same eligibility/clock handler | playback.canStep → AdvanceWinter |
| G03 | Clan Book | Established Clan Book navigation (#fjord-book) → same reader.open(); founding chapter dismisses | ClanBookReader.menuClick; #fjord-book forwarding |
| G04 | Expedition groups | Established Expeditions navigation → existing FjordInterface.open; redundant hamburger removed | FjordPlay click → close menu → showManagement(true) → shared.select(null) → refresh() → expeditions.refresh() → desktopUI?.open('expeditions') |
| G05 | Quality | Settings → Graphics → Quality | quality change → resolvePresentationQuality / world.setQuality |
| G06 | HDR lighting | Settings → Graphics → HDR lighting | syncHdr; FjordHdrLighting |
| G07 | Local effects | Settings → Graphics → Local effects | effects change; CampfireEffect / precipitation |
| G08 | Keep screen awake / Allow screen sleep | Settings → Display → same ScreenAwakeControl | ScreenAwakeControl.click / acquire |
| G09 | Camera views & controls | Help & support → Camera views & controls | native details disclosure |
| G10 | View settlement | Help & support → View settlement | controller.setView(arrivalPose) |
| G11 | View highlands | Help & support → View highlands | controller.setView(highlandPose) |
| G12 | Loading diagnostics | Help & support → Diagnostics → Loading diagnostics | native details disclosure |
| G13 | Copy last loading diagnostics | Help & support → Diagnostics → Loading diagnostics → Copy last loading diagnostics | lastIslandLoad → clipboard.writeText |
| G14 | Save last loading diagnostics | Help & support → Diagnostics → Loading diagnostics → Save last loading diagnostics | lastIslandLoad → download |
| G15 | Campaign | Split by purpose into Save game, Load game and separate lower New game / Replay | native details disclosure |
| G16 | Save locally | Save game → Save on this device; same saveLocal / fallback writes | SharedSettlement.saveLocal → fjordCampaignKey + sharedCampaignKey |
| G17 | Load locally | Load game → Load device save; same restoreInGame backup/rollback; no new confirm | restoreInGame(() => localSettlementText(localStorage)) |
| G18 | Export Fjord campaign | Save game → Download campaign file; same Fjord export and startup eligibility | this.campaign.exportJSON → download |
| G19 | Export canonical JSON | Help & support → Diagnostics → Developer data → Export Core JSON; same partial export | this.session.saveJSON → download |
| G20 | Import campaign | Load game → Load campaign file; same validation/restore/rollback | file.text → restoreInGame |
| G21 | Campaign seed | Lower New game / Replay → Seed & scenario options → Campaign seed | startNewCampaign(false) → proposal.newCampaign |
| G22 | Island / validated set / plots | Lower Seed & scenario options; actual recipe.version replaces hardcoded v1 | campaignFields / campaignIslandPlan |
| G23 | Enable winter weather | Lower Seed & scenario options; applies on replacement, not live editing | campaignFields; startNewCampaign / shared.restart |
| G24 | Enable exploration & rival clan | Lower Seed & scenario options; applies on replacement, not live editing | startNewCampaign → discoveryEnabled |
| G25 | Use the same founders | Lower Seed & scenario options → Use the original founders for replay; legacy new-founder restart retained | sameFounders change; startNewCampaign(true) |
| G26 | New campaign from seed | Lower Seed & scenario options → Start from this seed; existing startNewCampaign(false) | startNewCampaign(false) |
| G27 | Restart with same / new founders | Lower New game / Replay → Replay original founding; existing startNewCampaign(true) | startNewCampaign(true) |
| G28 | Download recovery diagnostics | Help & support → Diagnostics → Developer data; existing debugLifecycle query gate | trace.snapshot → download |
| S01 | Sound / Enable sound | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | FjordAudio.enable / restoreFromGesture |
| S02 | Mute | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | audio.configure / audio.enable |
| S03 | Master volume | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | input → audio.configure |
| S04 | Sound groups | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | native details disclosure |
| S05 | Ambience | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | input → audio.configure |
| S06 | World | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | input → audio.configure |
| S07 | Interface | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | input → audio.configure |
| S08 | Sound state / sound-pack explanation | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | AudioControls.refresh; selectFjordSoundPack |
| S09 | Playing/fading/buffers/PCM counts | Start Settings / game Settings → Sound; same AudioControls element and audio owner; existing QA-only count gate retained | AudioControls.refresh proof branch |
| S10 | Debug / Performance overlay | Start Help & support → Diagnostics; game Help & support → Diagnostics; same preference/owner | PlaytestPerformance.settings / configure |
| S11 | Freeze / Unfreeze display | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | frozen display toggle |
| S12 | Options | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | native details disclosure |
| S13 | Move corner | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | corner preference / paint |
| S14 | Copy diagnostics | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | PlaytestPerformance.exportJSON → clipboard.writeText; fallback(text) |
| S15 | Save JSON | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | diagnostic Blob download |
| S16 | Screen recording | Same overlay Options → External screen recorder; explanatory text; report schema unchanged | recording metadata update |
| S17 | View | Same opt-in Performance overlay → Options; existing public behavior/report owner unchanged | configure(view) |

New navigation: start Back/Escape restores opener focus; game Close/Escape restores menu focus; section Back closes its native disclosure. Help → How to play invokes the existing Founding Journey control. Optional Give feedback uses only `FJORD_FEEDBACK_URL` (HTTPS, no embedded credentials), adds no campaign data and opens a protected new tab. No URL is configured in this branch, so the CTA is absent. Return to start is omitted because a safe lifecycle handoff is not implemented. Existing primary Clan Book and Expeditions remain visible in their established responsive navigation.

Duplicate expedition pre-actions were not reproduced: the removed hamburger path cleared selection and refreshed before the same interface; established navigation already owns open/refresh. No expedition command, discovery, route, provisions or outcome logic changed. Gameplay fixture/state remains available for #299/M01 independently.
