# Responsive island loading (#153)

New `/fjord-play` campaigns and current-island restarts prepare their pinned island in a dedicated module Web Worker. The worker calls the same deterministic generator and campaign-foundation preparation as the headless API. Generator versions, curated seed selection, blueprints, Core rules, saves and discovery state are unchanged.

A full-screen Canvas 2D sea preview appears first. It receives at most 128 × 128 sampled canonical heights and existing ground-zone codes per preview. The coast, relief and later ground colours are the actual requested island. No settlement sites, rival footprints, navigation, inventories or private diagnostics enter the preview payload. Labels report the running phase; there is no percentage or simulated geological animation. Each completed terrain snapshot fades into view. The temporary geographical silhouette does not reveal gameplay knowledge. This slice does not implement or claim the future gameplay fog-of-war system.

Once assets, canonical entities, materials and GPU preparation are ready, the existing RTS camera moves from overhead to the player's actual settlement. The camera stays above the canonical surface. **Skip camera arrival** and reduced motion go straight to the final view. The simulation and movement clocks remain stopped throughout generation, preparation and arrival. New campaigns therefore first become playable at **Summer 800, tick 500**, with their normal starting stocks. The normal automatic clock starts only after arrival.

The owner limited this introduction to **new campaigns**. Existing saved-campaign loading/import retains its established path and saved time, without a new cinematic introduction. It does not convert old worlds or reset their seasons. Legacy-geography restarts also retain their original route; they do not show a new-island preview.

## Recovery and ownership

- **Cancel loading** (or Escape) terminates the active worker. First-load cancellation offers **Try again**. Cancelling a new/restarted campaign retains or restores the previous canonical campaign, geography, selection and scene.
- A worker error or unavailable worker displays an explicit retry action. No synchronous generation fallback silently freezes the UI.
- The client terminates workers after completion, cancellation, error and timeout. Revision IDs reject obsolete messages. Page disposal terminates work; loading never owns the simulation clock.
- The final validated blueprint crosses the worker boundary once. Its campaign metadata is reattached to the immutable runtime cache; the compact saved island recipe is unchanged. Preview buffers are transferred and are never persisted.
- Environment Lab uses the same worker for generation and conifer replanning and offers **Cancel generation**. It remains an unmasked developer tool with its existing diagnostics.

## Main-thread preparation

Native terrain geometry and blend-mask/index construction yield between bounded batches. The synchronous headless functions and yielding browser functions share the same implementation. Source textures, geometry, draw groups, shadow quality and material technology are retained. Texture uploads, initial native GPU draws and initial character reconciliation are staged between input opportunities. Individual browser/driver operations can still create long tasks; measurements are evidence, not a fixed loading-time guarantee.

## Validation and review

- `tests/async-generation.test.mjs`: canonical worker/synchronous equality, pinned campaign metadata, bounded non-private preview, cancellation/supersession/timeout/errors, identical yielding terrain buffers and initial ground-wear masks.
- `scripts/qa/check-cinematic-loading.mjs`: immediate preview and initial cancellation.
- `scripts/qa/check-cinematic-flows.mjs`: worker retry, cancellation before and after scene replacement, skip, and retained campaign.
- `scripts/qa/check-cinematic-legacy.mjs`: legacy restart keeps its original route and saved geography.
- `scripts/qa/check-cinematic-lab.mjs`: shared Lab worker, touch cancellation and conifer replanning.
- `scripts/qa/check-cinematic-lifecycle.mjs`: page unload and the existing missing-ground-material fallback.
- `scripts/qa/profile-cinematic-loading.mjs`: desktop, 390px mobile and 1024px tablet, Low/Standard, reduced motion and skip. These are browser emulations, not physical iPhone/iPad certification.
- [Review and measurements](qa/cinematic-loading/review.html).

The complete sequence still requires owner visual review. This work does not auto-merge #153.
