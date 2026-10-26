# Contextual support #278: normal-rule QA

The final-source cohort produced one real housing-loss aid episode under **1,000 bps offer / 5,000 bps acceptance / 50 ticks**, adding one contribution to the existing capacity-2 weather-support bank. The same episode replayed through current Fjord and SharedSettlement and is available as a genuine paused save.

**32/32 final campaigns completed; 35/35 independent public tests passed.** No later weather assessment used the contribution within the fixed ten-year bound. This demonstrates the normal loss→offer→accepted→completed→bank chain, without a measured mortality-benefit claim.

## Protocol and source

[Protocol v4](protocol-v4.json) was frozen before its runs. Seeds 1–16 each ran ten years in disabled and enabled arms. The first successful phase ended the search; no seed-32/64 extension ran. These are housing-maintenance stress campaigns, not estimates of general unmanaged aid frequency.

The public policy salvages the actual founding longship, buys two actual occupied households' homes, specializes/upgrades the first once, then assigns available adults to farming at each Summer management point. The first home contains the first actual reciprocal adult couple, with a fixed lexical fallback. All ordinary costs, upkeep, production, weather, mortality, family/care, social participation, livestock and CPU autonomy remain active. No resource grant, forced draw, fabricated event, edited save flag, new housing/care rule or expedition is used.

The Core cohort uses current Fjord four-species rules and Summer 800 founding with its ordinary generated legacy-graph CPU world. The separate review initializes the actual baked current Fjord island, physical two-clan world and discovery. Player episode times, parties and event IDs match.

Base HEAD was `91eb2d947acf9c8c8d1d5a5f60f5176be8bb5cce`; implementation changes were uncommitted. Actual source bytes, independently of that base commit, are pinned in [Core manifest](manifest-v4.json) and [review manifest](review-manifest-v1.json):

| Evidence | Exact source/runner/protocol fingerprint | LF-normalized fingerprint |
| --- | --- | --- |
| Core cohort, 65 files | `72f359ddca37d6a407d575963ac262bebbb84d7c09009bd2920355c5608f696e` | `03819f390afdfe0f855b7500abc5b01e4e2ec73ab5aa2251e26719e1242246de` |
| Fjord review, 178 files | `ea8f4f260d602ddd52f8e0ff50a06fee9c5f8b56ce43efb678f0d124ecd55e44` | `ca88aa0045fcaf191b622bafec68cf44e348a7d00603317b35c0365f05a28db4` |

The manifests also retain runtime, runner, protocol, artifact and baked-asset hashes. Accepted measurements passed source checks before and after. Original `--verify`/`--replay` commands require exact Windows worktree bytes. [Portable verification](verify-portable-v1.mjs) instead checks the recorded LF-normalized source hashes and normalized text artifacts; it does not claim a new simulation or browser run. Repository `-text` attributes preserve the frozen QA JSON/MJS bytes.

## Matched results

[Compressed raw results](raw-v4.json.gz) retain every command/cost, actual initial rules, loss-window party/care/social states, bank checkpoints, player events, weather/deaths, CPU identities/endpoints and exact save/load hashes. [Summary](summary-v4.json) retains every paired seed.

| Ten-year totals, 16 campaigns per arm | Disabled | Enabled |
| --- | ---: | ---: |
| Actual occupied housing losses | 16 | 16 |
| Offered / accepted / completed | 0 / 0 / 0 | 1 / 1 / 1 |
| Contributions / bank at end | 0 / 0 | 1 / 1 |
| Declined / ended / zero-contribution completions | 0 / 0 / 0 | 0 / 0 / 0 |
| Later weather-support applications | 0 | 0 |
| Endpoint Food / Materials | 1,635 / 13 | 1,635 / 13 |
| Resident Food / Materials produced | 5,256 / 0 | 5,256 / 0 |
| Livestock Food / Materials produced | 326 / 32 | 326 / 32 |
| Resident / livestock Food shortfall | 185 / 24 | 185 / 24 |
| Upkeep paid / collapse salvage | 127 / 108 | 127 / 108 |
| Resident deaths | 5 | 5 |

The other 15 enabled cases had no offer. Negatives include actual caregiving among affected adults in seeds 2, 4, 9 and 11 and the singleton/no-partner loss in seed 10. No-offer is not relabeled as decline or proof of a particular eligibility cause. There were no normal full-capacity, declined, ended or no-collapse cases in this phase; controlled public tests cover those boundaries.

Stocks, production, shortfalls and deaths matched in this bound. Paired comparisons are exploratory: equal seeds can diverge after a death prevented by a later assessment, so these results do not establish an efficacy rate.

## Genuine current-Fjord review

Import [review-completed-v1.json](review-completed-v1.json) with the existing campaign load flow. It is paused at **Winter 803/tick 50, 37 Food / 6 Materials, support 1/2**, with one unread completed-aid Attention record. The first declared successful seed is 3: actual reciprocal partners Daumantas (`founder-1`, 40) and Dervla (`founder-4`, 29) were co-displaced; Daumantas helps Dervla.

At normal initial 15 Food / 5 Materials, salvaging actual `founding-longship` returns 20 Materials. Building homes for actual households `founder-1` and `founder-10` costs 10 each; farmer specialization costs 0; one upgrade of `house-1` costs 5, leaving 0 Materials. [Exact replay data](review-replay-v1.json) retain every initial/annual farming assignment, tick command and actual transaction.

| Canonical time | Actual event/state |
| --- | --- |
| 802/999 | [Before-loss save](review-before-annual-loss-v1.json): 56 Food / 0 Materials, bank 0. |
| 803/0 | `BuildingCollapsed event-117`: real upgraded `house-1`, Daumantas and Dervla affected, 7 Materials salvaged. Existing second-home upkeep then costs 1 Material. |
| 803/0 | `SupportOffered event-121`: recipient Dervla, helper Daumantas, actual source `event-117`, normal 1,000 bps offer. [Offered save](review-offered-v1.json): 36 Food / 6 Materials, bank 0. |
| 803/42 | `ResourceProduced event-122`: `founder-9` produces 1 Food through ordinary farming. |
| 803/50 | `SupportAccepted event-123`, normal 5,000 bps acceptance; then `SupportCompleted event-124`, bank 0→1. |
| 810/500 | Fixed ten-year endpoint: 148 Food / 0 Materials, bank still 1; no later weather application. |

The Food increase is recorded farming output. Aid adds only the existing shared contribution; the home remains a tent. No repair, rebuilding, resource gift, journey or expedition is claimed. Only completed aid creates the successful-help notification. All three saves restore exactly, remain paused and replay to identical bytes. Completed canonical Core SHA-256: `8c4b0529fcdf36f96f1105df5f2917c4bf50e771dcaf6afc78e77d6731fc6cb8`.

## Negative source audit and version preservation

[Final seed-17 replay](seed17-source-replay-v2.json) replays the historical fixture's exact 16 commands on final Core: actual house loss at 803/0 affects Helmikki and Lemppi; 50 more ticks give **no support event / bank 0** under normal rules. This separate source audit does not expand the cohort. Its old `bbb018013e682b76288ae3a2a44c4bcaa7457b8d` state hash remains historical.

- v1 completed the same 32 cases but correctly failed final identity when null validation hardened during execution. [Status](historical-status-v1.json) and [raw outcomes](historical-raw-v1.json.gz) remain.
- v2 failed all 32 constructions before gameplay because its QA runner copied an invalid founding-phase string. [Status](historical-status-v2.json) and [raw failures](historical-raw-v2.json.gz) remain. A new frozen version corrected the runner without changing policy or seeds.
- v3 completed and source-verified all 32 before final unrelated-helper validation hardening. Its [manifest](manifest-v3.json), [raw outcomes](raw-v3.json.gz), summary, protocol, runner and earlier seed-17 audit remain unchanged.
- v4 reruns the same 32 after that validation-only change. Decompressed raw outcomes match v3 byte-for-byte. All earlier protocols/runners and historical studies are preserved.

## Executed verification

From the feature checkout:

~~~powershell
$env:TEMP = 'D:/CodexSites/Pillagers/scratch/migration-20261023/tmp'
$env:TMP = $env:TEMP
node docs/qa/contextual-support-278/cohort-v4.mjs --verify
node docs/qa/contextual-support-278/replay-cohort-v4.mjs --selected
node docs/qa/contextual-support-278/review-v1.mjs --verify
node docs/qa/contextual-support-278/review-v1.mjs --replay
node docs/qa/contextual-support-278/seed17-source-replay-v2.mjs --verify
node docs/qa/contextual-support-278/seed17-source-replay-v2.mjs --replay
node docs/qa/contextual-support-278/verify-portable-v1.mjs
~~~

All passed. The selected Core pair independently replays every public command and compares all results exactly. Optional `replay-cohort-v4.mjs --all` replays the same declared 32 cases; it does not extend the cohort. Existing evidence is never overwritten. On a checkout with different runtime-source line endings, use the portable compatibility command; exact replay requires the original exact source hashes.

[Final independent public tests](public-checks-v2.tap): **35 passed, 0 failed, 0 skipped**, covering Core, history, GameplaySession, read-view and campaign resume. Explicitly controlled probability/weather tests cover absent source/helper, care, pending departure/death/transfer, decline, full shared capacity/FIFO, source cap/uniqueness, duplicate/reload/split replay, tamper rejection and actual Severe-assessment use. They do not substitute for the normal cohort. [Earlier 32-test output](public-checks-v1.tap) is retained separately.

QA JavaScript passed Node syntax checks and manual style review; the project has no formatter command. Browser rendering, LAN import and owner-device review remain the parent task's separate checks.

## Integration verification

Root independently ran 98 relevant Core/history/session/invitation regressions: all passed,
with zero failures or skips. The production build and TypeScript passed through normal public-asset
validation. Application/test/current gameplay diffs passed whitespace review. Frozen QA protocols
and runners retain their measured original CRLF/EOF bytes, including whitespace notices; they are
not reformatted after measurement. Required exact-head GitHub CI remains the merge gate.
