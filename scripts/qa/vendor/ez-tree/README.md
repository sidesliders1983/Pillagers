# Pinned EZ-Tree authoring source

Revision dcf309bd86bd521083d9c70f01f2de45fdc7c457 of dgreenheck/ez-tree. Original files are byte-identical to the locked publisher URLs; .gitattributes prevents checkout line-ending conversions from invalidating their hashes. The complete preset index dependency set is retained so original source imports are unchanged. Only the three existing pine presets are exported for this experiment.

The upstream leaf shader is retained in the unmodified source for provenance, but the export page replaces its material with native static MeshStandardMaterial before any rendering/export. This vendor directory is an offline authoring input, not imported by Pillagers production code or the live review fixture. It does not introduce a new production wind/GLSL implementation.

LICENSE covers code and bundled pine leaves. src/app/public/textures/LICENSE.md separately attributes Bark003 to ambientCG CC0. textures/ contains real Git LFS media bytes, not pointer text. Original and exported texture bytes are locked separately because GLTFExporter performs image orientation/roughness packing.
