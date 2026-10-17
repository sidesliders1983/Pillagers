# Exploration interface · #180

Expeditions now separates crew preparation from exploration on the actual island. The preparation workspace uses group cards, occupation icons, a three-step journey and a visible Food quote. A compact exploration toolbar replaces the large workspace while choosing a destination or travelling.

## Review

Open the [QA launcher](https://acer-railway-fact-smaller.trycloudflare.com/playtest/#exploration), then **Load exploration & rival clan**. This deliberately loads the existing paused Summer 800 / seed 32 save with normal founding resources, one hidden living rival and two eligible founders in Group 1. The launcher asks before replacing an existing active session and retains one recovery copy.

1. Open **Expeditions**. Inspect the crew and its occupation icons; unavailable residents have specific reasons. Create another group to see that members already assigned elsewhere are unavailable.
2. Choose **Prepare expedition**, review the Food quote and choose **Pack supplies**. The real two-person pack costs 4 Food once. The workspace closes and the exploration toolbar appears on the world.
3. Click nearby land to preview a flag. Choose **Send group** to confirm, or click elsewhere to move the preview. **Cancel** and **Esc** discard only the proposed destination. Previewing sends no simulation command: it never dispatches, spends Food, advances time or reveals land.
4. If paused, choose **Resume travel**. Use **Show group** to move the camera to the group's actual position. **Change destination** uses the same preview-and-confirm interaction and the same carried supplies.
5. Choose **Return home** to recall from the group's actual position. The toolbar closes when the expedition ends. Reopen Expeditions to prepare another journey.

The group button in the toolbar opens crew/expedition management. Opening a management surface hides the toolbar; returning to the map restores it. Group changes and camera actions do not buy supplies or restart the simulation. The global clock remains under the player's control. A running simulation continues while a flag is being previewed; Pause travel affects the whole simulation.

## Interaction budget

These counts describe the normal path from the named state, excluding optional inspection or cancelled attempts. A terrain click counts as one click. Preparing a new crew adds **New group** and one click per resident.

| Starting state and goal | Clicks |
|---|---:|
| Ready group, running world → open Expeditions, prepare, pack, flag, send | 5 |
| Same path from the paused QA save, including Resume travel | 6 |
| Active expedition on the map → change destination, flag, confirm | 3 |
| Active expedition on the map → order Return home | 1 |
| Active expedition on the map → centre camera on the group | 1 |

Confirmation of packing and confirmation of a map flag are separate decisions. The first spends Food; the second commits movement. No destination is sent merely by inspecting the map.

## Preserved rules and implementation

- `ExpeditionPanel.ts` owns transient selection, the unconfirmed flag, crew controls and the map toolbar. It sends the existing `CreateExplorationGroup`, `SetExplorationMember`, `StartExpedition`, `ExploreArea`, `RecallExpedition` and `CancelExpedition` commands.
- Departure is quoted by `GameplaySession.startExpeditionOffer`, including membership, eligibility, resource and concurrent-expedition constraints. The displayed crew and Food cost are checked again before packing.
- A flag is quoted by `GameplaySession.exploreOffer`, using each member's actual rendered departure position. Confirmation requotes against the current state. Preview never exposes routes, hidden rival sites or unearned discovery information.
- Supplies and phases come from `inspectSpatialExpeditions`. The meter represents remaining active endurance, not unopened food. Approximate active time includes travel, exploration and returning; it is not a destination ETA or a guarantee of safe return.
- The existing pace override, supply consumption, return rules, stranded state, legacy packless journeys, paused saves and discarded unused supplies remain Core-owned. Ending a prepared journey does not refund Food.
- `FjordPlay.ts` connects actual terrain picking, the destination marker, camera focus and the existing global clock. The toolbar is disposed with the scene. `FjordIcons.ts` and `fjord-interface.css` extend the current visual language without dependencies or rendering passes.

The closed preparation workspace does not rebuild resident lists. Map controls are rebuilt only when their rendered content changes. The toolbar leaves the normal resource/time/navigation controls available. Its measured rectangle is reported separately from total HUD coverage; it is not an FPS benchmark.

## Verification

See [browser observations and source hashes](observations.json), [focused regressions](focused-tests.txt) and [published build verification](public-check.json). The browser check uses the normal compiled game, actual world clicks, canonical saves and physical travel, rather than a mock API. It also checks a disabled campaign, keyboard membership selection, separate groups, cancelled packing, flag cancellation, redirection, a paused save reload and ending a prepared journey without a refund.

The final browser result is **PASS**, with zero browser errors and matching hashes for all five changed UI source files. The public launcher, scenario, JavaScript and CSS match the checked local build byte for byte. At both captured viewports, the toolbar stays inside the scene, above navigation, without horizontal overflow; all its buttons remain in bounds.

| Captured viewport/state | Toolbar size | Screen area outside this toolbar |
|---|---|---:|
| 1440 × 900, choosing a destination | 690 × 204 px | 89.1% |
| 1024 × 636, exploring with feedback | 690 × 247 px | 73.8% |

These percentages exclude only the exploration toolbar; they do not subtract the other HUD elements. The compact viewport retains a larger relative footprint and remains a useful target for later responsive polish.

TypeScript and the normal Vite build pass. The existing large-chunk advisory remains. **43 focused tests pass, with zero failures or skips**, covering expedition pacing/provisions, spatial journeys, CPU-clan rules, home improvements and work plans. Script syntax and diff checks pass. Formatting was reviewed manually; the project has no configured formatter.

The layout check caught and corrected inherited `aside` sizing that stretched the toolbar. An initial browser attempt also reached its cold-load timeout while other local CPU work ran; the final harness retains the same world-readiness requirement with a 300-second loading budget. A later run required a precise navigation-button selector after the physical trip completed. These were resolved before recording the final browser result.

Screenshots:

- [Crew preparation](crew-preparation-desktop.jpg)
- [Food confirmation](departure-confirmation.jpg)
- [Exploration toolbar on the map](choose-destination-desktop.jpg)
- [Unconfirmed destination](destination-preview.jpg)
- [Exploring at 1024 × 636](exploring-compact-desktop.jpg)
- [Returning home](returning-home.jpg)
- [Home again](home-again.jpg)

Desktop browser viewport checks do not constitute physical iPad/mobile acceptance. Full mobile work remains #182. No gameplay, balance, geography, save-schema, model-pipeline or simulation-performance changes are included. Earlier home/visual reports retain their historical source hashes and measurements.
