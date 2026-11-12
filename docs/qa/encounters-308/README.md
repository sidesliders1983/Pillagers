# On-site encounters #308 — review evidence

Source: ce7076a6e5a5b8ca55d4f7026ee5967e91f5cee7, stacked draft [PR330](https://github.com/sidesliders1983/Pillagers/pull/330) above #329/#328. No main merge or Sites publication is included. Owner physical acceptance is deferred to the combined combat/offense QA through #310.

Open [the review page](review.html) on the LAN server for downloadable real checkpoints and short test instructions. It does not import or replace a campaign. Import a downloaded JSON through the normal Load game flow in a separate local test session.

## Current validation

| Check | Result |
| --- | --- |
| Exact-head Character contracts CI924 | PASS: build, tracked public assets, all character assets and Lab previews, 1,807 tests passed / 0 failed / 10 existing source-fixture-dependent tests skipped. [Run](https://github.com/sidesliders1983/Pillagers/actions/runs/43253109848). |
| Focused encounter/cargo/gear/history/transport/session/projection tests | PASS: 48/48; genuine annual births, custody, concurrency, release, actual delivery and batch parity included. |
| Existing Recon/territory and historical arrival regressions | PASS: 22/22. Historical arrival assertions use a genuine parent455481db save, not stripped encounter fields. |
| Legacy exact comparison at committed source | PASS: 12 scenarios / 78 complete serialized checkpoints, including root/CPU RNG and all events. |
| Matched real defender/equipment trial | PASS: 24 symmetric + 4 one-sided rows, actual committed counts 0/1/2/4; provisional coefficients, no balance approval. |
| Real production full journey | PASS: campaign72 / Baked v3 island195, four depart, Áilu dies on site at Winter801 tick141, three return at tick490 and deliver30 Food. |
| Native Chrome public journeys | PASS: 9/9 functional + 6/6 focused continuations; zero page, request or HTTP errors in successful runs. |
| Physical Safari, thermal/FPS and long-session acceptance | NOT TESTED; owner combined QA remains pending. |

Alpha package was intentionally skipped because this draft has no packaging label; no earlier failed check caused that skip. The ten existing test skips require original source fixtures that are intentionally absent from CI. The current build's usual bundle-size and Three CommonJS deprecation notices remain visible; validation was not weakened.

See [the full native pass/fail/not-tested matrix](native-QA.md). Root also inspected all four selected screenshots. Actors are small at the ordinary camera distance; this slice only provides factual facing/status/removal. Detailed equipment and encounter motion continue in #309/#310.

## Recorded scenario and media

The production fixture uses unchanged actual BakedCatalog geography, generated named people, paid public exploration/Recon and awareness adoption. Starting stocks are explicitly funded and domestic mortality/fertility/partnership are quiet for combat isolation. Neither bodies, visibility, combat outcomes nor terrain were inserted.

- [Before on-site combat](media/desktop-four-real-crew-before-default-combat.jpg)
- [Three living crew after the actual on-site death](media/desktop-three-real-crew-after-on-site-death.jpg)
- [Three survivors still travelling](media/touch-landscape-three-survivors-before-home-clock.jpg)
- [Actual homecoming and stock receipt](media/touch-landscape-three-survivors-arrived-world.jpg)
- [Desktop ordinary-clock casualty recording](media/desktop-on-site-casualty.webm), raw74.52 seconds.
- [Touch-emulated physical homecoming/history/reload recording](media/touch-physical-homecoming.webm), raw63.44 seconds.

These are real checkpoint continuations, not a single continuous500-tick browser movie. Full continuous progression is covered by public Core proof. Chrome coarse-pointer emulation is not a physical iPhone/iPad test. Native duplicated Withdraw/Return controls/captions remain a minor recorded UX finding; the underlying action passed.

## Reproducibility and raw artifacts

[manifest.json](manifest.json) records retained bytes and SHA-256 values. Gzip files preserve the exact original bytes, including executed scripts and raw report paths; the readable Markdown is an index, not a replacement for raw receipts. Do not package native temporary Chrome profiles or original source models.

The six checkpoints are real SharedSettlement exports and can be decompressed/imported normally. All seven originally generated checkpoints roundtrip exactly; the omitted departed checkpoint is retained in the local workbench. Native scripts and source reports are gzip-preserved under scripts/ and the root report files. The balance raw-case bundle contains each UTF-8 JSON file with its exact hash/text. Legacy source manifests and executed proof are under legacy/; the preserved parent source is reproducible from Git commit455481db00105fdaf67e8e213314eb79da37c7bc. Restore scripts into their recorded scratch paths in an isolated checkout of the source pin before replaying. The local workbench README gives QA_GO and production/matrix invocation parameters.

The first native attempt is retained as a resolved harness failure: an ambiguous selector matched two equivalent buttons. The successful runs use the explicit accessible Withdraw label. The draft local full-suite log is historical: it ran while source changed and caught the newborn cadence bug, missing Recon caption, manual Recall timing/batch release, historical-arrival fixture expectations and a study source-checksum change. Their actual fixes are covered by focused reruns and the final green exact-head CI; that draft run is not presented as passing.

No performance/device-temperature conclusion or final balance/art approval is claimed.
