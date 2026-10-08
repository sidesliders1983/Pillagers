# Issue #10: reference clothing queue

The twelve original outfits are cropped directly from the supplied sheet.
`prepare-clothing-references.py` records source hashes and rectangles. The
reference design is never redrawn or recreated from primitives.

`run-clothing-pipeline.ps1` is the unattended continuation worker. It prepares
installed-model mattes, waits for the existing hair GPU queue to finish, then
generates six beard references followed by twelve outfits, one GPU job at a
time. All generation uses the installed Pixal3D weights with offline mode.
Per-job failures are recorded and the generation queue continues. Successful
raw GLBs and provenance remain under scratch for review; this worker does not
publish unreviewed meshes into Character Lab.

Resume from `scratch/clothing-v03/CHECKPOINT.md`, `pipeline-status.json`, and
each generation log. Hair has its own generation/finalization status and the
long optimization retry log. Do not start duplicate generation workers.

## Remaining integration work

Generated figures still contain source skin/body: extract actual garment
surfaces and separate upper/lower/full-body/over-layer modules before LOD
optimization. Review all extracted silhouettes, including belts and boots.
Transfer weights onto the existing PillagersHumanRig, without another skeleton.

Assign ordinary outfits from a named seed stream, with no manual selectors and
no gender locks. Preserve material regions so cream, sage, blue-grey, brown and
rust can vary independently. Keep separate module definitions for later roles.

Fit by garment silhouette and clearance envelopes rather than copying body
surface deformation. Preserve an open hem and loose cross-sections; expansion
must accommodate chest, belly and hips without tracing every body facet.
Skirts/shawls require blended torso/hip attachment rather than independently
following each leg. Hide covered body regions if needed. Cloth simulation is
outside issue #10. Validate idle/walk/run, all LODs, morphology extremes and
export before publication. The current technical waist wrap is not a finished
reference garment and will be replaced when accepted modules exist.

The issue remains incomplete until actual generated clothing has passed those
checks and is integrated; reference preparation alone does not satisfy it.

## First integration batch

`cream-tunic`, `long-dress` and `mantle-tunic` are the first LOD2 runtime batch.
See [base clothing integration](characters/base-clothing.md) for extraction,
shared-rig fitting, seed assignment, coverage and verification. The nine remaining
generated figures are still candidates. Raw generation completion never implies
automatic acceptance or publication of clothing.
