# Occupation headwear

The four supplied farmer, fisher, hunter and smith GLBs are fitted to the existing Meshy Human. They occupy the independent **Headwear** slot in Character Lab; hair and carried tools remain independent. Fjordplay assigns the corresponding hat explicitly to adult residents in those four occupations. Other occupations and children remain bare-headed. Existing generic and farmer clothing selection remains intact; adult fishers use the owner-approved fisherman pass 009 separate tunic, trousers and mirrored shoes.

Preparation preserves the supplied triangle topology, UVs and albedo appearance (2,981–3,132 triangles per hat). Albedo maps are resized to 1,024 pixels; high-frequency normal/PBR maps are removed. Runtime assets are approximately 0.5–0.7 MB rather than 45–51 MB. Raw source hashes and source filenames are pinned in `scripts/characters/occupation-hats.sources.json`; local originals remain under `Assets/Characters/Human/Hats`. Run `node scripts/prepare-occupation-hats.mjs` to reproduce the fitted GLBs, native bindings and measurements.

All hat vertices follow the existing native Head joint (5), with the same 44-bone body skeleton and exact body/LOD topology bindings. No duplicate rig or body clipping is introduced. Calibration uses the original neutral body, never an animation pose. Walking and Idle then move the hat rigidly with the Head.

The bald seat is the measured baseline, with zero hair lift or added radial scale. When hair is present, the cap can grow only 12% radially (4% for the close smith cap), with at most 12 mm additional lift. Only owned upper-crown hair vertices inside the cap height range are tucked under its measured cavity. Exposed lower locks, the braid chain and brown strap retain their source shape and DNA colour behavior. Removing a hat restores the source hair; removing hair restores the bald hat seat. Shared cached assets are never modified.

Owner feedback requested a larger fisher hat approximately 5 cm lower and a tighter smith cap. The fisher cap has a 30% wider footprint, its baseline centre lowered 5 cm, and a slight rearward tilt to keep its front brim near the brows. The smith cap has a narrower, lower crown and tightly bounded hair clearance. These are proportions in the native authoring frame; the existing DNA skeleton scales all fitted items with the resident.

Visual references are modern worn reconstructions, used for proportions rather than evidence of occupation-specific Viking dress:
- [Close leather skullcap](https://www.battlemerchant.com/en/mittelalterliche-lederkappe).
- [Wide-brimmed hand-felted hat](https://medieval-market.com/en/hats-and-strawhats/322-hand-felted-hat-atkin.html).
- [Fur-trimmed Birka-style cap](https://medieval-market.com/en/hats-and-strawhats/630-birka-hat.html).

The independent technical asset lifecycle remains source-bound preview, like the other explicitly selected fitted garments. This does not globally auto-publish hats to unrelated bodies. Review pages and neutral front/back/top comparisons are under `output/occupation-hats-001`. Regression tests cover exact hashes, bald/all four hairstyles, source ownership, lower hair preservation, colour independence, wrong bindings, all three body LODs, Walking/Idle rigidity, and occupation changes. No gameplay rules or balance values change.
