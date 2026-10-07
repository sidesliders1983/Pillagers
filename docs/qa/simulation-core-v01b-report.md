# Simulation Core v0.1B test report

Executed 2026-10-07 for issue #27.

- Full suite: 54 passed, 0 failed, 0 skipped (including 20 new mechanics tests).
- TypeScript: passed.
- Production build: passed; existing large Three.js chunk warning remains.
- 10 starting personas / 50 Winters: all five replay and invariant checks passed.
- Seed: 27. Start Winter 800; end Winter 850. Final personas: 22 (12 births).
- Final stocks: 863 Food, 103 Materials. Events include 7 partnerships, 5 houses built and 1 collapse.
- Identical final state across repeats, 137/863 split ticks and Winter-825 save/reload.
- Final-state SHA-256: `51c660ef2b0a51e48bd18505c2e46af8899f4b3c7f6df16f1ee1427138962c32`.

## Required scenario evidence

| #27 scenario | Automated evidence |
|---|---|
| Tent 50% productivity | Housed worker 10 Food, same worker in tent 5 |
| Vacant house collapses after debt 3 | No vacant upkeep; debts 1/2; third boundary collapse |
| Paid reoccupation resets debt | Debt 2 returns to 0 after paid occupied upkeep |
| Salvage 50% all investment | Base 10 + upgrade 5 returns 7 Materials |
| Matching bonuses only | Upgraded farmer produces 12; other specialization produces 10 |
| History and first-switch 75% | Exactly 1,000 penalized ticks; per-role progress retained |
| Maternal zero and caregiver cost | Mother output 0; donor restores it while losing own work/fertility |
| Cousins allowed; close kin prohibited | Eligibility cases plus prohibited loaded-pair rejection |
| Dominant marker one generation | Child markers identify parent; grandchild markers absent when chance is zero |
| Player overrides autonomy | Career lock/release and caregiver replacement/null locks |

Additional tests cover consumption at exactly 16, aging floor, apprenticeship, adult children staying home, fertility cooldown/Food shortage, initial-family care, malformed saves, five-Winter care completion and wall-clock-free replay. Review found two boundary defects: removing a caregiver just before a Winter boundary and loading a prohibited partnership. Both were demonstrated by failing regressions, fixed and rerun successfully.

The long simulation is a generous-stock QA fixture, not a claim of final balance. It proves reproducibility and integer/nonnegative stocks for this seed and command sequence. Broader balancing, mortality and UI acceptance are outside this issue. Reproduce with `node scripts/qa/run-simulation-v01b.mjs`; generated JSON and final save appear in `artifacts/qa/simulation-v01b/`.
