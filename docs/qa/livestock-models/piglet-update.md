# Piglet replacement — 20 October 2026

The owner supplied a replacement `Pig/baby-pig.glb` after deferring the previous
200,958-triangle download. The new source contains 2,808 triangles, 27 joints
and one Meshy walking clip. SHA-256:
`f7449164e74571d9ab4ae30effd6ac1081cd93637fac9faa7c27032bf0a97649`.

The unchanged source geometry is now published as `pig/baby`: 407,764 bytes,
WebP textures, Meshopt compression and the same six authored activities as
the other supplied models. The runtime registry now selects it for actual
young pigs in both player and observed-rival projections. No Core, founding,
species balance or save changes are included. Originals remain unchanged.
Regenerating the adult pigs produced identical files.

## Verification

- The presentation/species test run passed **22/22**, with no failures or skips.
  It includes real pig births, correct baby asset selection, decoded poses,
  loop endpoints and one-shot death/fade behavior. See [raw output](tests-piglet.txt).
- TypeScript and the production build passed. The existing large-chunk warning
  remains. This narrow follow-up did not repeat the previous full 1,054-test run;
  [the original report](report.md) retains that separate evidence.
- The publication audit verified 13 runtime models and exact preservation of
  all 16 original cattle activity clips. Source and output hashes are recorded
  in [source-audit.json](source-audit.json).
- The browser gallery loaded all 13 models. The new piglet's upright walk,
  grazing, folded rest and fallen/fading pose were inspected. At 6.9 seconds
  the one-shot Death is held while the body fades. No physical mobile-device
  performance claim is made.
- Fixed studio renders use the decoded current runtime GLB:
  [walk](images/pig-baby-walk.png), [death](images/pig-baby-death.png).
  The original twelve-model overview images remain records of the prior pass.

## Reproduction

```powershell
node scripts/prepare-livestock.mjs C:/Users/Devoteam/iCloudDrive/Pillagers/Characters/Livestock --species pig
node --test tests/livestock-presentation.test.mjs tests/livestock-species.test.mjs
node scripts/qa/audit-livestock-publications.mjs
node scripts/validate-public-assets.mjs --tracked
pnpm exec tsc --noEmit
pnpm build
```

The [same review page](review.html) now includes `pig · baby` in View.
