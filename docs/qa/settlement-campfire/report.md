# Settlement campfire verification

- Source StoneCampFire converted with Blender 4.5.9 in an isolated background process.
- Compact runtime retains 13,517 triangles and four supplied maps (packed into glTF material textures); provenance hashes are in the runtime manifest.
- Approved display scale: 2× on all axes. Observed width: 6.401m; height: 1.500m.
- Public projection/save-load tests cover stable clearing, full upgrade clearance, inward-facing ordinary homes, unchanged Farmyard headings, dry paths from the first home, Core immutability, exact new saves and atomic imports. Older visual layouts are rebuilt around the clearing.
- Browser: real source bounds fit their reservations, no campfire/house fallback, direct canvas resident touch selection, house management touch selection and actors remaining outside the enlarged fire ring. No page errors.
- Screenshots use summer, Low quality and 1366×900 touch emulation in Edge. This is not physical iPad or hardware performance certification.
- Supplied model has no flame animation. Ceremonies, settlement information and multiple settlements remain future work.
- Existing historical reports were left intact. Current housing and bridge documentation were updated.

Reproduce the browser evidence with `node scripts/qa/check-settlement-campfire.mjs` against the LAN development server.
