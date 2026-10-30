# Sites playtest publication

The public playtest is https://pillagers-test.sidesliders.chatgpt.site.
It follows `main` in https://github.com/sidesliders1983/Pillagers.
Site identity is recorded in `.openai/hosting.json`; upstream settings and the
last successfully published GitHub commit are in `.openai/site-source.json`.

## Automatic publication

The existing GitHub `Character contracts` workflow runs the build, public asset
validation, character validation and tests for main pushes. A linked Sites cloud
task checks every hour for a newer main commit with successful validation.
The cloud task performs publication through the supported Sites tools; GitHub
Actions does not store a Sites deployment credential. The workstation may be off.
The cloud scheduler supports at most one run per hour.

Each run compares GitHub main with the live `/site-version.json` before doing
work. An unchanged commit is a quiet no-op. Failed, pending, cancelled or skipped
validation leaves the live Site unchanged. Recheck the main head and its CI
immediately before deployment so a newer merge cannot be overwritten.

The Site source repository contains the updater and build-info scripts, the public version configuration, `.openai/site-source.json`
and VERSIONING.md plus this document. Acquire a fresh source credential through Sites and open the
Site in a clean directory to retrieve them. Never rely on a workstation path,
a stored short-lived credential or an earlier task's filesystem.

## Update procedure

1. Run `node scripts/prepare-sites-main.mjs` from this checkout. It fetches GitHub
   `main` and exports its exact commit into a new ignored source directory. It
   preserves the active checkout and local changes. The hosting entry keeps
   main's Fjord Play startup and error handling at `/` and `/fjord-play` only.
   Lab pages and the older world entry are omitted from the entry's imports, so
   Vite does not emit their page chunks. Local development retains every Lab.
   The export includes root configuration, `src`, `public`, `scripts` and `tests`;
   original authoring models and historical QA reports are not copied into this
   temporary build directory.
2. Check GitHub Actions and commit checks for that exact upstream commit. Require
   a successful `Character contracts` run and no failed, pending, cancelled or
   skipped validation. If checks fail, report the inherited failure and retain
   the current live version.
3. Install the fresh snapshot's locked pnpm 10 dependencies for the existing
   asset/loader validation. Do not rebuild/allocate an alpha during promotion.
   Find the successful **Alpha package** workflow for the exact current main SHA,
   download its named artifact and extract it into an ignored directory. The
   GitHub artifact connector or authenticated GitHub CLI can download it. Require
   that workflow's success as well as Character contracts and every commit check.
   If no artifact is available, leave the live Site unchanged. See VERSIONING.md.
4. Run the **current main** publisher (refresh older retained Site helpers first):
   `node scripts/prepare-sites.mjs --source-directory FRESH_MAIN --alpha-artifact EXTRACTED_ARTIFACT --site-directory SITE_CHECKOUT`.
   It requires main still current, the exact source/input hashes and a sealed
   distributable artifact. Its compiled bytes, build number, attempt, UTC time
   and embedded identity are copied unchanged. Validate the actual hosted payload
   at both routes before publication. Original source models and model-preview
   are omitted, as are retired Golden body/body-r1/body-r2 previews. Proven
   redundant native binding JSON is omitted only after the existing real loader
   reproduces the exact bytes from its prepared binary; all prepared binaries,
   models and textures remain. Run `node --test scripts/sites-prepared-bindings.test.mjs`.
   The expanded payload stays within 255 MiB, individual files within 25 MiB.
   The original CI inventory stays as source-artifact evidence; site-version.json
   records its hash, unchanged buildInfo and explicit hosting omissions.
5. Use the Sites source workflow to commit, push and package the static checkout.
   Save and deploy that exact archive and source commit to the existing Site.
   Preserve public access. Obtain temporary credentials through Sites tools;
   never save them in GitHub Actions, source files or documentation.
6. Verify successful deployment, anonymous access and `/site-version.json`. Only then update
   `last_published_commit` in `.openai/site-source.json` to the upstream commit.

The live `/site-version.json` is authoritative for the published upstream commit;
the local configuration is a cached record. Avoid duplicate publications when
the live commit is already current. Report an actionable failure without changing
game code, bypassing validation, or changing Site access.
