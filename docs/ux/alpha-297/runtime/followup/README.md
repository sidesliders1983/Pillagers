# Focused follow-up after review — #297

29 October 2026. Same frozen main/Sites-export build as the original audit:
`4086baac26c6953b879b439546b68f2406ca767a`. No runtime code change or altered
campaign was used for these observations. #298 implementation is a separate branch.

## What was checked

| Check | Actual result | Evidence / limit |
| --- | --- | --- |
| Invalid file | Importing `{"notAFjordCampaign":true}` reports Unsupported simulation save. Existing resume, local Fjord and Core-only candidates remain available. The original local save is then selected and actually opened. | [Invalid import](01-invalid-file.jpg); test JSON is retained. No simulated browser storage corruption. |
| Storage/recovery contract | All 21 existing campaign-start, quota/retry, resume, loading-test and shared-save regressions passed against unchanged main source. | [Complete output](recovery-regressions.txt). Quota failure is injected at the public storage port; physical browser storage was not filled. |
| Touch landscape | Owner opened LAN and reported completing the requested menu open/close, scrolling, Family Tree return and pause checks successfully. | Owner statement below. This is owner-reported evidence; exact device, OS and browser were not supplied. It is not a full Safari or accessibility certification. |
| Exploration arrival / discovery | The same real Group 1 paid another 8 Food. A different visible land target reached Exploring. Minmantė recorded a real first great black-backed gull sighting at Year 800 tick 745. | [Exploring](02-successful-exploration.jpg), [canonical export](post-return-attempt.json), [activity](04-discovery-return-events.jpg). No extra Food, edited animal, revelation or forced result. |
| Return home | A real Return home order entered Returning. At tick 837 the canonical mission became Stranded: **The confirmed return route is blocked.** Seven remaining Food units were lost on stranding. | [Stranded state](03-stranded-after-return-order.jpg), canonical export/events. **Successful discovery is demonstrated; successful return on this route is not.** |

Owner response to the requested physical-touch checklist, verbatim:

> Ik weet niet zo goed wat je wilt dat ik test maar ik heb het geopend,de stappen gedaan die je vroeg en dat werkt (zoals daarvoor)

The checklist scope was explained afterwards. This confirms those requested
interactions as reported, not approval of #298's still-new menu implementation.

## Canonical timeline — do not collapse discovery and return into one success

| Event | Canonical time | Recorded fact |
| --- | --- | --- |
| event-15 ExploreAreaPrepared | 800 / 733 | explore-2, Group 1, founder-2, 8 Food paid. |
| event-16 ExploreAreaDeparted | 800 / 733 | Real order to target x=6, z=187 using the carried pack. |
| event-17 ExploreAreaSuppliesConsumed | 800 / 734 | One Food unit consumed. |
| event-19 WildlifeSighted | 800 / 745 | Great black-backed gull; first for clan; Minmantė is the recorded expedition witness. |
| UI Return home command | Before 800 / 837 | Actual control reported Return home ordered and Returning; no return-start event was invented for a command that did not record one. |
| event-24 ExploreAreaSuppliesLost | 800 / 837 | Seven Food units lost. |
| event-25 ExploreAreaStranded | 800 / 837 | The confirmed return route is blocked. |

The earlier explore-1 remains in the same exported history: return reason
outward-route-blocked and a later Completed lifecycle outcome at tick 526. It is
not replaced by this second attempt. The new mission's outcome is Cancelled after
manual recall, while its actual status is Stranded and returnedAt is null. Neither
Completed nor Cancelled alone is a truthful summary of every aspect of the journey.

## Ownership and bounded next steps

- **R01 / #299: presentation.** `Chronicle.ts` formats ExploreAreaReturnStarted and
  ExploreAreaReturned; `ExpeditionPanel.ts` prints the previous mission outcome;
  `AttentionHistory.ts` appends outcome to a stranded condition. The canonical
  return event omits the earlier reason. A future projection needs mission-ID
  correlation and explicit finished/successful/returned-early/stranded distinctions.
  Preserve original events, costs and already-published book text.
- **M01 / technical mechanics follow-up (#151 baseline owner):** a confirmed return
  route was rejected on this real island. Canonical `modeStepPassable` /
  `prepareModeTick` in SpatialExpeditions owns that decision. The exported state and
  exact target bound the case. This is a **separate reproducible case candidate**,
  not a root-cause claim or permission to change pathfinding inside #298/#299.
  Verify with the real terrain/navigation context before deciding a fix. Do not
  refund supplies or hide the failure with friendlier wording.
- #298 can continue its reviewed, UI-only menu work because the menu hierarchy
  does not depend on claiming a successful return. #297 remains open for return
  evidence and remaining acceptance. #300 must retain this technical risk, device
  provenance limits and independent-player gate; no external-alpha sign-off here.

No additional general redesign or speculative second/third UX repair is proposed.
