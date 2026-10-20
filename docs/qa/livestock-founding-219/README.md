# Seeded livestock founding review (#219)

Start with [the balance report](report.md), [interactive comparisons](review.html) and
[the complete proposed rules](proposed-rules.json). The current candidate is an explicit trial;
shipping New campaign still uses the cattle founding contract pending owner review.
Additional models remain #220.

## Evidence directories

- `measurement/`: rejected strict-cap pilot, 36 completed observations; interrupted, not a full matrix.
- `measurement-soft-v2/`: six control observations from the interrupted protocol check.
- `measurement-soft-v2-final/`: the frozen 630-case candidate matrix, with its original revision,
  subsequent resumptions, checksums and per-case source/protocol identities.

The first two directories and their decisions are historical evidence. They are not pooled into the
final candidate. `evening-checkpoint.json` records the owner's October 19 pause at 160 completed cases;
it is an historical checkpoint, not the current matrix status.

## Reproduce and inspect

Run a new study into a **new** directory:

```sh
node scripts/qa/run-livestock-study.mjs --out=scratch/livestock-219-new-study
```

The defaults are 30 seeds, seven contrasts, three fixed policies, 40 years, two bounded workers,
five minutes per case and a 1,000-animal observation budget. A limit stops measurement and is reported;
it never kills or caps canonical livestock.

An interrupted run can continue into its existing directory with `--resume`, using the original
runtime, matrix options and unchanged simulation/scenario/policy/candidate source hashes. The runner
checks every retained raw checksum, rejects protocol changes, preserves completed cases and records
the resuming revision separately. Do not edit the frozen economic sources while a study runs.

```sh
node scripts/qa/run-livestock-study.mjs --out=docs/qa/livestock-founding-219/measurement-soft-v2-final --resume
node scripts/qa/write-livestock-report.mjs
```

The report writer requires a finished matrix. For an explicitly partial review, append `--partial`;
partial medians and observed shortages remain labeled. It reads raw evidence and writes derived
`summary.json` and `report.md`; it does not modify raw cases or gameplay coefficients.

The browser fixtures in `check-livestock-founding.mjs` use the real founding factory and extra
Materials solely to create an inspection yard. No balance result uses that grant. The saved browser
report covers desktop and touch emulation, not physical-device acceptance. Validation status and
remaining approvals are recorded in `validation.json`.
