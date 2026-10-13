# Loading review — validation in progress

The implementation uses the existing deterministic generator in a module worker. The owner narrowed the cinematic introduction to new campaigns; saved-season presentation changes are excluded.

The baseline was measured before implementation at `bf5529f` on this Windows laptop in Edge headless. The original uninterrupted generation produced 18.7–20.3 second main-thread long tasks. The two default-Low baseline contexts reached the existing ready marker in roughly 25 seconds. See `baseline.json`.

`iteration1.json` records the first worker/yielding implementation before native GPU warm-up was divided into smaller draws. Its browser long tasks showed a remaining 1.5–2.8 second preparation peak. This evidence motivated staged texture upload and first-use native rendering. Total loading time varied as the older development laptop warmed up; these sequential runs are not a hardware-controlled speed benchmark.

The final viewport matrix and recovery checks are being completed. Do not interpret the intermediate screenshots or green headless tests as owner visual acceptance.

Recorded values are phase durations, browser Long Task entries delivered before readiness, preview/result payload information, animation-frame callback counts and the largest 40 ms heartbeat gap. They are **not individual frame-time samples**. The optional `profileLoading=1` query measures the UTF-8 JSON representation of the final worker result as a size proxy, not the browser's undocumented structured-clone wire allocation. It adds serialization work in the worker for measurement only.

The full-island preview is a temporary geographic view. No rival-site overlay or hidden gameplay facts are included, and no discovery state is changed. Gameplay fog-of-war is not implemented by this change.
