# Fjord visual lifecycle QA — #89

Date: 2026-10-10. Route: `/fjord-play`.

## Result

The focused Core/projection tests pass (17/17), as do the browser production, persistence, queue and 25-Winter checks. The scene presents canonical simulation state without adding gameplay rules, RNG draws or save fields.

[Visual review](review.html) · [Production checks](browser.json) · [Queue evidence](queue.json) · [25-Winter checkpoints](winters.json) · [Lifecycle/weather checks](variants-all.json)

## Production and persistence

Real clock ticks cross controlled work thresholds and award resident Food, resident Materials and adult female cow Food. Each observed `+1` matches the producer identity, actual Core event, exact replay and stock delta. Labels omit names, rise and gradually fade; pausing allows existing visual effects to finish without advancing the simulation.

A Winter jump aggregates real awards as `+N`, separately for each producer/resource. The queue scenario records 21 units from 12 producers, with at most six labels visible and six producers queued. Every producer retains its world anchor and exact total. Tablet emulation checks label bounds. Explicit load, restart and 2D/3D handoff clear old effects; fresh post-load awards still display. Slaughter, consumption and salvage do not fabricate production.

## 25 actual Winter commands

Seed 17 runs through the UI from Winter 800 to 825, with 26 checkpoints including founding. Initial reserves are deliberately generous (10,000 Food / 1,000 Materials); founding pairing is 100%. Lifecycle and weather rates retain their defaults. Occupied homes are built through real commands, founder-1 becomes a farmer and founding cattle are assigned to that farm.

Every checkpoint compares actual rendered identities, source models, canonical age, cattle stage/sex, ancestry, assignment, shelter, overcrowding, position and weather with the Core. Save/export equals the actual command replay. There are no missing positions or model placeholders in this scenario. Surviving resident model identities remain stable during growth.

- Resident production: 868 units; cow production: 157 units, checked per producer/resource against factual events.
- Four child births and two resident deaths.
- Seventeen cattle births and fifteen cattle deaths.
- Two building collapses and one Farmyard function change.
- Final population: 12 residents and five cattle.
- All four weather classes occur, including Severe Winters 815 and 821.

## Controlled variants

Separate imported fixtures make births and mortality deterministic for lifecycle coverage. They verify baby → young adult → female cow/male bull assets, child growth with the same model identity, real home upgrades, salvage to tents with unassigned cattle, retained death/history inspection, and vacancy collapse. These controlled rates are test fixtures, not new game defaults.

The four weather captures share camera/quality. Native lighting/fog settings, material winter treatment and the factual forecast are inspected together. Harsh and Severe are deliberately misty; visible silhouettes remain and HUD/selection remain readable. Quality changes retain the preset; disabling weather restores the baseline. Gameplay Lab, 2D settlement and original Fjord routes receive smoke checks. Browser error arrays are empty.

## Reproduction

Start Vite on port 5180, then run from the repository root:

```powershell
node --test tests/fjord-lifecycle.test.mjs tests/fjord-bridge.test.mjs
node scripts/qa/check-fjord-lifecycle.mjs
node scripts/qa/check-fjord-output-queue.mjs
node scripts/qa/check-fjord-winters.mjs
$env:QA_CASE='all'
node scripts/qa/check-fjord-variants.mjs
```

`QA_ORIGIN` can override the server URL. `PLAYWRIGHT_MODULE` can override the bundled Playwright module path. The scripts produce PNG captures and raw JSON evidence; published review images are WebP encodings of those captures.

## Validation limits

Chromium uses SwiftShader on this older laptop, at 1280×800 and touch/tablet emulation at 1024×768. This is functional/render verification, not an FPS benchmark or physical iPad Safari certification. No hardware performance threshold is imposed here.

TypeScript and character validation pass locally. Local bundling passed with public-asset copying disabled because the disk is nearly full; the unchanged standard build and full suite are validated by GitHub CI. PR readiness requires green checks on the final head.

Humans remain existing static models with uniform age scaling. FarmHomestead uses the existing FarmHut yard; higher levels retain a yard marker. No new clothing, anatomy or animation system is implied. Extreme worlds that exhaust safe placement slots remain an explicit presentation limitation; this run does not exhaust them.
