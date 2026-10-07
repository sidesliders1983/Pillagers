# Simulation Core v0.1A

Implements issue #26 against PR #25's canonical gameplay specification (commit 2763784da7314b374afdc4d508acb166c47b047e): CORE-001..003, TIME-001..003, PERSON-001, FAMILY-001 and ECON-001/002.

## Confirmed Pass A choices

- Starts at Winter 800, tick 0. There are 1,000 integer ticks per Winter. This is a technical prototype scale, not a balance decision.
- advanceWinter advances exactly 1,000 ticks: Winter 800/tick 430 becomes Winter 801/tick 430.
- Food, Materials and workProgress are nonnegative safe integers. This pass stores progress without producing or consuming resources. Conversion thresholds and economy mechanics belong to the next pass.
- Public test boundaries: fixture initialization, commands, state/events, age, JSON serialization/reconstruction.
- Persona birthWinter owns age truth. Its CharacterDNA is the persistent initial snapshot; DNA.age does not advance. Consumers use personaAge for current age. Death freezes the derived age and retains identity/history.
- Family, household, residence and building have separate IDs and records. Parent/partner links belong to personas. No fertility, housing allocation or decay mechanics run here.
- Commands return a detached state; callers replace their canonical state with that result. Reads/serialization never advance time. Events use game time and stable sequence IDs, and occupation events record event-time name and age.
- Fixture DNA uses the existing seeded generator. Seed and reserved rngState are stored in saves; this pass has no stochastic tick mechanics. Future random mechanics must persist their stream continuation.
- Reconstructing a save validates its version, integer invariants and basic references. No migration or offline progression is attempted.

## Headless example

```js
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
let state = core.createFixtureClan(26);
state = core.applyCommand(state, {type: 'AssignOccupation', personaId: 'einar', occupation: 'smith'});
state = core.advanceWinter(state);
console.log(state.time, core.personaAge(state, 'astrid'), state.stocks, state.events);
state = core.reconstructState(core.serializeState(state));
```

Run `node --test tests/simulation-core.test.mjs`. The core imports only dependency-light CharacterDNA generation; it requires no browser, Three.js or GLB. Fjord/AnnualCycle integration and UI remain separate follow-up work.

## QA and delivery

The reproducible 10-persona, 50-Winter scenario runs with `node scripts/qa/run-simulation-50-winters.mjs`. The committed delivery report is [docs/qa/simulation-core-v01a-report.md](qa/simulation-core-v01a-report.md). Generated states, command logs and annual checkpoints are written under ignored artifacts/qa.

The existing full app build requires the local, untracked Assets kit and installed dependencies, as on main.
