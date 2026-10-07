# Gameplay Lab v0.1C

Issue #28 adds `/gameplay-lab`, a lightweight playable client of the Simulation Core. Open it directly or use the Gameplay Lab link in Fjordside's development menu. It starts paused at The Landing, Winter 800, seed 32. No Three.js, GLB or art asset is imported by the Lab.

## Playtesting flow

1. Inspect Food/Materials, founder occupations and temporary shelter. Stock trends show the measured difference from the last successful command, not a forecast.
2. Keep/salvage the ship, slaughter cattle or assign each animal to an active Farmyard home through the existing commands. Costs/yields are displayed from saved configuration.
3. Assign occupations or return career control to autonomy. Person cards show live age, household, partner/children, CharacterDNA traits, occupation aptitude, productivity, work progress, care state and occupation history.
4. Build a house for a household or move it to an available residence/tent. Building cards show vacancy, charged upkeep, debt, invested Materials, specialization, upgrade level and the automatic Farmyard function. Specialize and upgrade through core commands.
5. For an active childcare group, choose an eligible caregiver or return care to the mother. Eligibility comes from the Simulation Core.
6. Inspect lineage by selecting a resident's name or Afstamming bekijken. The lineage panel links parents, partner and children and lists family groups.
7. Advance one Winter manually or press Start. Choose 1, 3 or 5 minutes per Winter and pause freely. Header progress, stocks and event history update during play.

The event log shows the latest 100 events in chronological order, including semantic types and expandable factual details. JSON exports retain the full event history. No narrative text or new simulation mechanic is authored by the UI.

## Pacing and saves

`GameplaySession` is the public non-DOM Lab boundary for commands, active elapsed time, snapshots and JSON save/load. It converts active browser time to explicit integer ticks and retains only a transient fractional tick remainder. Speed changes preserve that remainder; pause stops progression. New campaigns/imports/loads reset pacing and start paused. Canonical saves contain no browser timestamps or offline progress.

The browser uses animation frames, caps an active frame's catch-up to 250 ms and pauses when the document is hidden. Returning to the tab requires Start again. Import opens the file chooser while paused and retains the input until selection completes.

Local save/load uses browser localStorage under `pillagers.gameplay-lab.v1`. It is explicit rather than autosaving over an existing campaign. JSON export/download and file import provide portable saved states. Imports require validated mechanics-enabled saves; v0.1A time-only fixtures are rejected with a visible message. Failed commands/imports leave the canonical state intact. New seed starts a separate generated campaign.

## Architecture

The Lab imports only the canonical Simulation Core and its dependency-light character/naming data. Shared public core queries expose work/productivity, occupation aptitude, caregiver eligibility and building status. Tick execution reuses those same work/building calculations. The UI displays saved records and dispatches explicit commands; it does not maintain a second economic/family model.

Buttons check command validity through the core. Invalid inputs are reported in the status notice. Fields and open disclosures are retained during live repaint. CSS is scoped to the separate Lab body/route. Fjordside and its existing renderer remain independently loaded; the new navigation link is its only presentation change.

## Verification

```text
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Browser proof is reproduced by starting Vite on port 5180, then running `node scripts/qa/check-gameplay-lab.mjs [node-module-directory]`. The optional directory points at a runtime containing Playwright; without it, a normally resolvable Playwright installation is used. The current QA uses the bundled runtime and an isolated headless Edge instance, requiring no project dependency on Playwright. Reports/screenshots are generated under `artifacts/qa/gameplay-lab/`.

This pass exposes existing cattle/ship actions because The Landing supplies them; it adds no new livestock rules. Mortality, reproduction, weather, expeditions, raids, trade, final art and balancing remain outside #28.

Farmyard correction: assigning a farmer in a tent creates no function. In a permanent home the first living farmer activates the Farmyard for free; the last farmer leaving removes it and unassigns cattle. Select each animal’s Farmyard in its livestock card. There is no standalone build button. Old version-1 landing saves migrate on local load/JSON import without compensation and with retained history.
