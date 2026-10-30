# FjordSide version and build identity

## Public version

`game-version.json` is the only editable public product version. It starts at
`0.1.0-alpha`, displayed as **v0.1 alpha**. Change it deliberately for a product
release: `0.1.1-alpha` displays v0.1.1 alpha; `0.2.0-alpha` displays v0.2 alpha.
Alpha/beta is the release phase, independent of local/preview/distributable origin.
The private package's historical 0.2.0 is independent. Do not change save, DNA,
asset, generator or simulation versions when changing this public label.

## One automatic numbering authority

The **Alpha package** workflow, `.github/workflows/alpha-package.yml`, is the only
allocator. GitHub's `GITHUB_RUN_NUMBER` is its sequence; it starts with that
workflow's first run. It is not the Character contracts counter, a commit count,
a PR number, the Sites version number or browser storage. Failed attempts may
leave gaps. `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` form the unique build ID
`alpha-<run ID>-<attempt>`. A retry keeps the sequence number and changes its
attempt/ID; distinct concurrent runs get different numbers and IDs. The friendly
label also shows the attempt when greater than one. This follows the
[GitHub variable contract](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

Push/PR builds produce artifacts; **nothing in this workflow tags, releases,
merges or deploys**. Only a clean main push/manual main run produces a
`distributable` origin. Other refs, including PR merge revisions, say
`preview build N`. Character contracts remains the validation authority; all
checks for the exact current main must pass before publication.

The workflow runs these steps on its actual checkout, never whichever main is
latest later:

1. `node scripts/prepare-alpha-build.mjs --output scratch/alpha-package`
   checks its designated workflow context, clean actual SHA and Git root. It
   exports committed build inputs, uses the shared Fjord-only route transform,
   reuses the installed locked dependencies and writes one artifact-owned stamp.
2. `pnpm --dir <prepared source> run build` consumes that stamp in Vite. Both
   the compiled app and `dist/build-info.json` receive the same record.
3. `node scripts/prepare-alpha-build.mjs --seal <prepared source>` verifies
   prepared/compiled identity, adds both route indexes and `site-version.json`,
   and writes SHA-256 output inventory `alpha-artifact.json`.
4. The workflow uploads `fjordside-alpha-<number>-<attempt>` for 14 days.
   Retain a downloaded artifact when longer archival is needed. An expired
   artifact requires a new workflow attempt, not a guessed old build number.

The record includes public version/channel, number/origin, ID, full actual SHA,
clean/dirty/unknown provenance, input SHA-256, UTC build time and sequence attempt.
`versionTag` adds build/attempt metadata to the public version. It is not a
content hash or save-compatibility claim. The output inventory provides byte
verification; select artifacts from the trusted exact workflow/run as well.

The first two real allocations are preview builds 1 and 2; [executed evidence](qa/alpha-build-320/README.md) records their actual runs, source revisions and screenshots. No official main alpha has been published by this issue.

## Local builds

Use the existing pnpm 10 commands: `pnpm dev`, `pnpm run build`, then
`pnpm preview`. Ordinary development needs no GitHub connection or allocated
number. The label is `v0.1 alpha · local <short SHA>`, with `-dirty` when the
source is modified. Missing source is explicit: `local unknown source`.
A source folder must own its Git root; a surrounding workstation repository is
never substituted. A legacy main export without a number remains an identified
local export. Dev server mode cannot inherit an official number from a prepared
source. Restart the dev server to refresh its startup source stamp after edits.
Static serving of a genuine compiled numbered artifact, including on LAN,
retains that artifact's number. Hostname, campaign seed, save imports, reloads
and opening a new campaign do not allocate or alter its identity.

## Sites promotion

The existing Site uses a separate static source repository, not the Character
contracts build output. The current main publisher helpers are now retained in
Git as well as in the Site. Refresh those helpers from validated current main
when upgrading an older Site checkout; do not use a legacy rebuilding publisher.
See [Sites publication](SITES-PUBLISHING.md) for the full procedure.

Prepare fresh main with `scripts/prepare-sites-main.mjs`, install its locked
validation dependencies, and download/extract the successful **Alpha package**
artifact for that exact SHA. Use the GitHub artifact connector or
`gh run download RUN --repo sidesliders1983/Pillagers --name ARTIFACT --dir PATH`.
No token belongs in an artifact or in Git. Run the current publisher with
`--source-directory FRESH_MAIN --alpha-artifact EXTRACTED_ARTIFACT --site-directory SITE_CHECKOUT`.
It requires current main, distributable origin, matching version/source/input
hashes and a valid sealed output inventory. Preview, stale, changed, missing or
unallocated artifacts stop publication. There is no fallback renumbering/build.

Promotion copies the compiled bytes and `build-info.json` unchanged. Existing
hosting filters still omit original source models, retired previews and proven
redundant bindings. `site-version.json` records the original CI inventory hash
and hosting omissions; `alpha-artifact.json` remains that **source artifact**
inventory, not a claim that omitted files are hosted. Hosting metadata/filtering
does not create another game build. The embedded app never fetches a newer
server manifest to replace its own identity. A cached old bundle reports itself.

## Tracing feedback

Read the line under the start-screen title or open existing About/Help build
details for the full ID, SHA, origin and UTC time. Existing user-triggered
performance/loading exports contain `buildInfo`; their historical `build`
string fields and `__FJORD_BUILD__` bridge retain their established meaning.
Feedback destinations remain owner-configured; no URL or upload is invented.
Map `sequence.runId` and attempt to the Alpha package run, compare its head SHA
and artifact, then inspect `alpha-artifact.json` for output hashes. The loaded
bundle is authoritative for what the player ran, even after the server changes.
