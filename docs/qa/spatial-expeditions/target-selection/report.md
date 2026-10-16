# Touch destination correction — PR #179

The owner reported “No reachable land route to that destination” on a physical iPhone. The exact tap coordinate was not available; the same failure was reproduced through the public Core by tapping dry ground whose rounded navigation cell was unavailable. A real 3D tap on the reserved middle place reproduced that failure class as well.

Core now proposes the nearest safe navigation point within 8 m, in deterministic distance/index order. The local surface between the tap and the proposal must remain dry and below the existing grade limit; another reserved parcel cannot be crossed. Existing full route planning and validation still decide whether each member can reach the proposed destination. Water, cliffs and destinations without a valid route remain rejected.

The offer returns the accepted destination, the marker shows it and Send group confirms that same point. The UI explicitly explains an adjustment and shows ordinary destination guidance without an exception prefix. No Food is spent and no ground is discovered during target preview or rejection. Old missions retain their saved routes/targets.

Validation: 25 public Core spatial/legacy expedition tests passed; a real-session browser test checks marker → confirmation agreement and retained picker focus; TypeScript and production build passed. The full production Edge touch flow passed with two individual routes, native Run, a real reserved-middle-place target adjustment, a later unknown-land journey, unchanged discovery at dispatch, exact reload, manual recall and return. Source hashes and raw diagnostic samples are in browser.json. This is desktop touch emulation; revised physical-device acceptance remains open.

The updated build uses the same LAN port and Cloudflare origin. Refreshing the page loads the correction without creating a new campaign. Current gameplay/input documentation is updated in docs/SPATIAL-EXPEDITIONS-V04B.md. Required CI must pass for the new head; the PR stays draft.
