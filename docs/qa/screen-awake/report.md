# Screen-awake browser regression

Date: 2026-10-11. Edge with a 1024x768 viewport and touch emulation. These tests exercise
campaign UI and the browser API boundary, within the approved browser test seam.

The initial test failed because the Keep screen awake control did not exist. The first
working vertical slice used real NoSleep.js media playback on the insecure HTTP LAN origin
in Gameplay Lab. The same control was then added to both player routes.

## Observed behavior

All three routes expose the opt-in touch button. On the HTTP LAN origin the browser reports
an insecure context and no native wakeLock API. Tapping the button starts the real embedded
media; tapping Allow screen sleep pauses it. Advancing a Winter preserves the enabled button
and does not start another compatibility player. Browser page errors: zero.

A controllable public navigator.wakeLock API fixture exercises lifecycle outcomes through
the Gameplay Lab button, status and standard browser lifecycle events:

- Native request type is screen; ordinary campaign repaint retains one request.
- Disabling releases the native lock.
- A rejected request remains visibly inactive and permits a successful retry.
- Hidden/visible events release and reacquire an opted-in lock.
- Native revocation updates the status and permits a retry.
- Cancelling an outstanding request immediately clears the button state, then releases a
  late successful lock. This regression was reproduced before the fix.
- A back/forward-cached page releases its lock and reacquires on pageshow. This regression
  was reproduced before the fix.
- Final pagehide releases the lock and removes its lifecycle and button listeners.

Native and visibility behavior above use external browser API/event fixtures, not a real
physical device's auto-lock. HTTP LAN playback is real, not a mocked NoSleep controller.
Physical iPad auto-lock suppression remains unverified. See the
[usage and physical QA instructions](../../BROWSER-SCREEN-AWAKE.md).

[Measurements](result.json) · [Gameplay Lab button](gameplay-lab.png) ·
[2D button](play.png) · [3D button](fjord-play.png).

## Reproduction

```powershell
node scripts/qa/check-screen-awake.mjs
pnpm run build
node --test tests/*.test.mjs
```

Source formatting is reviewed manually; the project has no configured formatter.

TypeScript and the production build passed. The complete local suite reports 553 tests:
552 passed, zero failed, one existing optional authoring fixture skipped. The existing
Vite warning about a Three.js chunk exceeding 500 kB remains. `git diff --check` passed.
