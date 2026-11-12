# Reproduce the bounded Recon proof

Use a clean D: checkout of the desired exact source pin, install locked project dependencies with pnpm 10, and copy these `.mjs` harnesses into `scratch/recon-307` under that checkout. Outputs stay beside the scripts. The original executed script hashes are recorded separately; copies preserve their explicit Windows Git/Chrome paths. Adjust those host paths if the existing installations differ, recording that change. Playwright comes from the existing Codex runtime or `PLAYWRIGHT_MODULE`.

Decompress `../legacy-direct-warning.shared.json.gz` to `scratch/recon-307/legacy-direct-warning.shared.json`. Node's `gunzipSync` can perform the lossless decompression. Set `QA_LEGACY_INPUT` to that decompressed absolute path so the scripts do not depend on the original workstation input directory.

For the final UI proof:

1. Check out `d33ca3a9ceae581a7be91e04b84c30e359f73e7d` and set `QA_GO` to that full hash. Keep tracked source clean.
2. Run `node scratch/recon-307/prepare-fixtures.mjs`. This adopts the actual committed baked seed-7 island, restores the genuine historical checkpoint, returns its real group home and dispatches new routes through public commands. It asserts exact Shared/Core roundtrips.
3. Run the existing Vite server on port 5199. Set `QA_ORIGIN` to its origin and `QA_QUOTE_ONLY=1`.
4. Run `node scratch/recon-307/check-native.mjs`. It launches isolated native headless Chrome contexts, verifies desktop and touch quote/Back/payment/Recall, checks the cleared targeting status and captures actual area/coastal world views. It writes a raw report, images and request/error observations.

For the full engine journeys, use clean source `f1a67cfff7b64f208d56d8ef53443738b375cb1a`, set the matching `QA_GO`, prepare with `prepare-fixtures-f1a67cff.mjs`, and run the preserved `check-native-f1a67cff.mjs` without quote-only mode. That original run passed six functional journeys but visual review found the targeting-status defect fixed on the later UI pin. Do not report that historical capture as the final corrected UI.

The actual baseline run requires a separate clean `c5340a9310cf2c2c651a3ca6ac5fe26f5198c96d` server on port 5198 and uses `check-baseline.mjs`. The raw record already includes its independent entry-source verification. Importing an old route into a new build is a different compatibility check.

These scripts use existing real scene controls and actual Core receipts. They require native Chrome and local browser automation access; a physical Safari/iPhone pass remains pending. No artificial navigation, future observation, manual event injection or guaranteed FPS target is part of this reproduction.

Exact executed .mjs bytes, including original mixed line endings, are preserved losslessly in the corresponding .mjs.gz archives. Readable .mjs copies normalize line endings only. Use the decompressed archive for the original executed SHA256 check; manifest.json records both hashes.
