# Longship Return home regression

Base: main 0b924665e7316e122c1fbce4ed5f380d58364503.
Branch: codex/longship-return-home. The existing clean D: workspace was reused.

## Reproduction and correction

Sail away, disembark, save/load and board again. The old transport saved that
remote berth as home. Return home then had a zero-length water leg and immediately
released the crew to walk the whole way back.

The owner confirmed the original harbour/boat starting point as the reference.
Reboarding now reserves a safe water return there and a land leg from the home
shore to each original departure point. Passengers remain aboard until the hull
reaches the home harbour. Repeated sailing destinations retain that reference.

Valid legacy embarked saves are accepted unchanged on import. A wrong remote
anchor is corrected on the next recall or Core tick, including an old return
already in progress. The hull continues from its actual saved position. The
bounded path search happens once when the wrong anchor is detected; normal ticks
only compare the saved reference. No render-frame path search was added.

Food charges, consumption, capacity, cargo, movement speed and Core RNG rules are
unchanged. Return home does not buy another pack or refund existing supplies.

## Executed verification

- Two targeted regression tests failed on the original implementation because
  passengers disembarked on the first return tick, then passed with the fix.
- All 72 focused transport, ship-selection/deck/passenger, spatial expedition,
  expedition-mode, island-mission and Founding Journey checks passed.
- Coverage includes the real expedition UI Return home button after reboarding,
  an automatic low-supply return, exact save/resume during the sea return,
  a valid historical wrong-anchor save, water-route validation, original harbour
  arrival before passengers are released, and completed land return.
- TypeScript, production build and public-asset validation passed: 615 public
  files, 12 compact model variants, 47 Terrain models, 14 prepared islands and
  56 character sources. The existing Vite chunk-size warning remains.
- Formatting was reviewed manually; no formatter is configured. git diff --check
  is required before commit. Logs are retained in scratch/qa-270/longship-recall-*.

CI links and final head checks are recorded in the PR. No physical WebGL/device
playthrough is claimed; the LAN preview is available for owner verification.
