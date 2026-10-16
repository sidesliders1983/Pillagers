# Direct destination tap and continuous running — PR #179

Owner feedback identified bursts during expedition travel and a redundant Send group step. Both changes stay in the same opt-in expedition slice. The owner's video was inspected locally; it is not copied into public review artifacts.

## Behavior

Explore Area enters destination selection. A single valid destination tap plans the journey and sends the group immediately, charging the existing whole-trip provisions once. There is no Send group/Move group button. Invalid destinations or insufficient provisions leave the group home with no charge. The real-session browser test verifies that an invalid tap leaves target selection open and canonical state unchanged, followed by a valid tap that sends immediately. The objective ring remains on the Core destination during travel and is cleared after return/recall or another order.

The old renderer interpolated every position batch in a fixed 180 ms, while the campaign supplied batches every 500 ms. That produced a short movement burst and a stationary remainder. The renderer now shares the 500 ms cadence constant with the campaign interval and adapts to observed active intervals up to 1 s. No additional Core updates, travel prediction, gameplay speed changes or saved presentation clock are introduced.

## Verification

- A browser test uses the actual FjordEntities, FjordModels, native resident source and LivingWorldController with real Core expedition commands. Before the correction it failed because positions stopped during every update interval. Afterward, controlled 50 ms frame steps progress evenly throughout 500 ms batches of 2, 3 and 8 canonical ticks. Pause freezes the rendered position, no sample passes confirmed progress, and Core JSON remains unchanged by rendering. Native Running and a non-placeholder body are asserted. Raw controlled position samples and source hashes are in smooth-motion.json; these are deterministic frame-time inputs, not FPS measurements.
- The complete production 3D touch flow at 1024×768 and 390×844 passed: create group, select two residents, tap an unknown land destination once, charge Food exactly once, retain exact body-origin routes, run, pause, reload exact Core state, recall and return. No confirmation control exists. browser.json retains source hashes and raw short diagnostic RAF samples; browser errors are empty.
- The real-session controls browser test, 12 spatial Core tests, TypeScript and production build passed locally. Existing earlier proof for terrain-safe destination correction and the legacy expedition rules is retained separately. Required full CI runs on the new head; the PR stays draft.

These are desktop Edge/browser checks with touch emulation. The revised flow still awaits physical iPhone/iPad feedback. The original measurements and prior confirmation-based screenshots remain historical evidence, rather than being rewritten as proof of the current interaction.
