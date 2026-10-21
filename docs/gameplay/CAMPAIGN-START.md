# Campaign entry

Normal `/fjord-play` entry and reload show the lightweight FjordSide start menu.
The public Sites root uses the same entry point. Merely opening this menu does not
generate terrain, import the scene, create WebGL, fetch models, advance time or write saves.
The approved static app icon is the only menu artwork.
The owner extended #238 to activate four founding species: cattle, pig, sheep and goat.
Fresh Fjord scenarios use `FjordLivestock.ts`, copying the existing #219 soft-crowding
coefficients unchanged and saving an explicit four-species founding pool. Chicken and goose
remain supported in historical/explicit test data, but cannot found new Fjord clans.
The founding stream is independent of human founders and domestic RNG. Both humans and
livestock derive their own seeded streams from the fresh campaign seed. Terrain still uses
the validated island pool; this is not a promise of three independently editable seeds.

| Action | Authoritative source | Loading and result |
| --- | --- | --- |
| Continue campaign | Valid active session; otherwise an explicitly selected recovery/import candidate | Restore its exact Core, geography recipe, layout, history, matching presentation metadata and fractional pace. Start paused, with no offline progress. |
| New campaign — same founders | Selected save's original seed and supported founding rules, verified against retained founder identities and original partnership events | Reuse `GameplaySession.restartCampaign(true)` and `FjordCampaign.restart(true)`. Preserve saved geography/recipe and founding phase; reset progression and history/read/Attention/selection state. |
| New scenario | One fresh uint32 seed, different from known saved seeds | Existing generator and current approved defaults, Summer 800, current island pool. New founders and history; a different seed need not mean a different pooled landform. |

Without a valid source, Continue and same-founders replay explain why they are unavailable.
A legacy source whose original identity fingerprint cannot be reproduced can still be
continued, but cannot promise a faithful founding replay. Existing Lab restart semantics
remain available to developers; the start menu does not silently substitute their populations.

`readRecoverySources` remains read-only and keeps its priority: valid active session,
otherwise resume checkpoint and matching canonical-local/Fjord sources. If recovery needs
a choice, the existing recovery/import screen selects a source and returns to the menu.
It does not infer recency from the highest simulated year or merge unrelated histories.
Metadata and founding eligibility are checked once per selected source, not per redraw.

Both new-start actions ask once before replacing recoverable progress. Cancel draws no seed
and changes nothing. A confirmed attempt chooses its seed once; retries keep that seed.
Preparation owns no persistence until terrain, models, graphics preparation and camera arrival
finish. Activation compares the original active-session record before one atomic session write.
A stale or departing attempt cannot activate. Manual local saves and resume recovery files are
not cleared to begin loading. Failed loads dispose provisional UI/scene ownership and offer
retry or return to the menu. Storage failure additionally offers export of the prepared campaign;
it never starts a supposedly saved game or falls through to a random replacement.

Quality/effects preferences are retained when available. New histories use the normal arrival
camera; Continue retains its saved camera. The in-game same-founders restart also retains the
saved geography/phase. In-game replacement controls confirm before changing the campaign.
No gameplay/balance values or provider/audio activation rules change here.

## Lifecycle and explicit developer paths

Warm tab/app returns, BFCache and live WebGL restoration keep the existing owner and pause
behavior. They do not run entry again. Explicit full-page transfers/recovery consume an `entry`
query parameter using `history.replaceState`, so a later ordinary reload shows the menu:

- `?entry=handoff`: used only by the explicit 2D → Fjord view switch; safely restore its playback intent after loading.
- `?entry=recovery`: explicit saved-settlement reload after context loss or a stale transferred BFCache owner; continue paused.
- `?entry=qa-continue`: explicit QA shortcut to the valid active save, otherwise the recovery chooser.
- `?entry=qa-new&seed=32`: explicit QA creation with the requested seed. Existing progress still needs replacement confirmation.

A sessionStorage record by itself is never a menu bypass. `?seed=32` alone does not start a game.
The remaining Labs and import tools keep their routes. Existing game-capture scripts that
expect immediate loading should use the explicit QA entry parameter or click Continue.

## Validation

Public session/recovery/startup and DOM integration tests cover founding fingerprints,
read-only inspection, confirmation cancellation, double activation, retry seed stability,
storage quota failure/export and departure fencing. Existing campaign-resume tests cover
exact progressed saves, terrain preparation, both clans, history, rollback and warm ownership.

Run `node scripts/qa/campaign-start-server.mjs`, then open `/fjord-play?auditEntry=1`.
This QA-only host observes Worker construction, WebGL context requests, actual model/texture
requests and save changes before application imports. The read-only result is the HTML
element's `data-entry-audit`. Instrumentation is absent from ordinary Vite and production builds.
See [the review](../qa/campaign-start/review.html) for screenshots and recorded observations.
