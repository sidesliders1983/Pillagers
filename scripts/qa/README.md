# Appearance browser review

`appearance-review.html` loads the actual `CharacterFactory`, asset registry and
Attachment & Fit implementation. Explicit module selection exists only in this
test harness. It does not add style controls or alternate fitting code to Lab.

Start Vite on port 4176, then run the following with `PLAYWRIGHT_MODULE` pointing
to an installed Playwright package. There is no browser/model download step.

```powershell
$env:REVIEW_MATRIX='full'
$env:REVIEW_OUTPUT='artifacts/appearance-pass/independent-final'
node scripts/review-appearance.mjs
```

The full default matrix keeps the 12 frozen Golden DNAs, tests all registered
modules with body LOD0/1/2, and skips female/child beards. It captures head
front/side/back/top and garment front/side/back in Idle, plus front/side at three
Walk and Run phases. Requested beard LODs are explicitly registered; fixed LOD2
hair/garment policy is retained. Additional ratio endpoint passes use
`REVIEW_RATIOS='1,1.3'` for hair/garments and `'0.75,1,1.5'` for beards.

Every sample reports actual equipped mesh triangles and final attribute buffers.
Garments have a hard fitted ceiling of 4,400 triangles (or a lower registry
budget), regardless of the source count. Unused fitted position/normal/UV/skin
or morph rows, missing referenced rows and invalid indices fail the structural
report. Run `node scripts/qa/fitted-geometry-audit.test.mjs` to verify that audit.
Structural success still requires a separate independent pixel verdict.

Focused diagnosis can set `REVIEW_FILTER`, `REVIEW_PROFILES`, `REVIEW_LODS`,
`REVIEW_CLIPS`, `REVIEW_PHASES` and `REVIEW_ANGLES`. Profile names may be short
(`neutral,older,child`) or complete Golden ids. `REVIEW_CANDIDATES` intercepts
explicit scratch candidate GLB paths for authoring review; it must be unset for
final public-asset acceptance. `REVIEW_CANONICAL_IDS='hair/short,hair/medium'`
changes only those test registry entries to a canonical authoring frame when
previewing candidates awaiting their metadata update. It does not change the
production fit implementation and must also be unset for final acceptance.
For candidates with a measured garment bind, `REVIEW_METADATA_JSON` accepts a
JSON object keyed by module id with metadata patches. The harness passes the
resulting full metadata through the production factory registration path and
records it per capture. `REVIEW_CANDIDATE_MAP` accepts a JSON object keyed by
module id with exact candidate GLB paths. A missing requested candidate aborts
the review; old published geometry can never silently fill that case.
`REVIEW_ALLOW_PENDING=1` records a known-failing
baseline without turning it into an accepted result.

The report binds captures to SHA256 of the GLB bytes the browser actually loaded,
compares them with current published bytes, counts fitted triangles/materials,
checks finite geometry, confirms the complete body index remains underneath the
module and confirms animation does not rerun fitting. These are structural
checks. Successful screenshot capture never constitutes visual approval.

Arrange browser captures for independent inspection with:

```powershell
python scripts/qa/contact-sheets.py artifacts/appearance-pass/independent-final/report.json
```

Inspect every module for extraction fragments, skull/body intersections, crown
pinholes, floating surfaces, sleeve/collar/waist/ankle gaps, inverted shading and
animation tears. Hairlines, the authored beard mouth opening, braid ties and
open garment hems are intentional reference boundaries. Do not classify all
mesh boundary edges as defects, or hide bad fit by deleting the body.

After registry regeneration and the production build, run:

```powershell
node scripts/qa/character-lab-review.mjs
```

That final UI pass imports default seed 1983, reported seed 1885184954, Golden
child/mixed/older/overweight fixtures and seed-assigned hair/beard styles through
the actual Character Lab JSON controls. It captures Idle/Walk/Run on desktop and
mobile, with all body LODs for the default. It also records loaded GLB hashes.
Record independent visual verdicts separately and rerun affected cases after
implementation fixes before accepting the library.

`module-surface-review.mjs` provides a test-only body-hidden, neutral material
FrontSide/DoubleSide diagnosis. A visible opening that persists with both
settings is geometric rather than a texture or reversed-normal effect; classify
intentional hairlines, mouth openings and cavities before calling it a defect.
This diagnosis is for classification only; body hiding and
DoubleSide changes never enter production or imply visual acceptance.

The surface diagnosis accepts the same `REVIEW_CANDIDATE_MAP` and
`REVIEW_METADATA_JSON` overrides, with `REVIEW_RATIOS` and a single
`REVIEW_PROFILE` (complete Golden id), for reproducible garment as well as head
diagnosis. `REVIEW_ANGLES` can include `underside`, `opposite` and `three` for
under-chin and opposite-cheek checks. Missing candidate files abort; every
loaded source response is hashed.

`asset-montage.py --report <final-report.json> --output <montage.jpg>` composes
fifteen neutral Golden/body LOD2/ratio 1/Idle front views into a readable final
overview. Repeat `--report` if modules span separate capture reports. It refuses
missing modules, report errors, structural failures and candidate/public hash
mismatches. A draft requires explicit `--allow-candidates` and is visibly labelled
as candidate evidence. The montage itself never implies visual acceptance.

`raw-source-review.mjs` diagnoses an immutable source before any canonical
fitting. It requires `REVIEW_RAW_FILE`, full `REVIEW_RAW_SHA`, and exact
`REVIEW_RAW_TRIANGLES`. It checks disk bytes, the actual uniquely routed browser
response, browser SHA256 and parsed source triangle count; missing/mismatched
evidence aborts, and public GLB fallback is forbidden. Original materials and
neutral FrontSide/DoubleSide snapshots use source axes and no geometry changes.
Optional `REVIEW_RAW_LABEL`, `REVIEW_ANGLES` and `REVIEW_RAW_MODES` control readable
diagnostics. Capture integrity does not imply source or fitted visual acceptance.
With valid explicit `REVIEW_RAW_*` inputs, run
`node scripts/qa/raw-source-integrity.test.mjs` for bounded negative checks:
missing source, wrong SHA and wrong parsed triangle count must all hard-abort,
with zero untrusted snapshots.
`module-contact-review.mjs` captures an immutable candidate and the complete
bare body from the same camera and pose. Set one `REVIEW_FILTER` module id,
`REVIEW_CANDIDATE_MAP`, and optionally `REVIEW_METADATA_JSON`; `REVIEW_LODS`,
`REVIEW_RATIOS` (one value), `REVIEW_PROFILE`, `REVIEW_ANGLES` and
`REVIEW_OUTPUT` select the diagnosis. It toggles module visibility only, records
the served candidate SHA and effective metadata, and never changes geometry.
