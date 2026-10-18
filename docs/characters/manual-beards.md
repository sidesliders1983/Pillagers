# Manually fitted beards

Four supplied beard GLBs are available on the existing Meshy Human in Character Lab: Braided, Double, Normal and Pointed. The independent Beard slot and direct links use beard/manual-fitted-{braid,double,normal,pointed}. Open /character-lab?beard=braid or the four-style comparison at /output/manual-beards-001/index.html.

Preparation preserves the supplied node transform, metre positions, vertex count, triangle order and source normals. There is no rescaling, repositioning, smoothing or remeshing. Only the source node transform is baked into geometry; the originals in Assets/Characters/Human/Beards remain unchanged. The source audit measures less than 0.000061 mm of float export rounding for every style.

All texture maps and UVs are removed. One opaque white material with neutral COLOR_0 receives the existing DNA hair/beard colour, including heritage and age; the existing Lab colour override also remains available. Exports are 0.20–0.24 MB with 2,730–2,980 triangles, compared with the 33–37 MB supplied sources.

Every vertex follows native Head joint 5 through the unchanged 44-bone skeleton. Exact SHA-256 body identities and topology correspondences cover all three native body LODs. There is no copied rig, new bone, animation, body mask or physics layer. The existing adult male beard eligibility still applies. Hair and occupation hats remain separate; owned geometry/materials prevent one character's colour or selections from changing another.

Run node scripts/prepare-manual-beards.mjs with the supplied beard directory as its optional first argument to reproduce the exports, bindings, provenance and measurements. The provenance pins the generator and source bytes. Raw source files are local Assets inputs, as with the manually fitted hair. The source-bound catalog retains its preview lifecycle; Fjordplay explicitly selects only these owner-approved styles.

Verification: 31 targeted beard, hair, headwear, Lab presentation and candidate tests pass; TypeScript and the production build pass. All four actual Lab choices load with automatic DNA colour and no browser errors. Neutral front/side views and Walking/Idle 02 evidence are under output/manual-beards-001. Source formatting was checked manually; the two review helpers use the existing TypeScript printer. No formatter dependency was added.

## Approved Fjordplay selection

The owner approved all four styles for Fjordplay. Adult residents whose existing DNA appearance includes a beard receive one of these four assets through the independent fjord.beard.adult.variant visual seed stream. Existing beard presence, derived sex and adult eligibility are preserved. Occupation changes do not change the selected style; DNA heritage and age still determine its colour. Beard selection participates in wardrobe cache identity and is reconciled on the same resident alongside hair, clothing, hats and tools. No gameplay rules, saves or Core RNG streams change.
