# Local asset inventory

Inspected all 47 files in `Assets/Terrain/` before implementation. There was no application, configuration, Git checkout, character model, texture directory or license file in the initial workspace.

All files are glTF 2.0 binary (`.glb`), with one mesh and one material per file. The pack uses embedded vertex colors, rough materials (typically roughness 0.92 / metallic 0.02), and no image textures or external image dependencies. Mesh data is embedded and Draco-compressed, requiring Three.js DRACOLoader. Authored node translations often center the model around its origin; the loader grounds the transformed bounding box before placement. Y is up; buildings and boats generally run along Z. One world unit is treated as approximately one metre for composition, without asserting a manufacturer scale specification.

The full kit includes terrain, shore and road tiles, scenery, architecture, harbor objects and props. The current scene uses a subset through semantic registry keys. Terrain/water are custom geometry to allow a continuous coast and hill; supplied turf, road and sky tiles remain available for later work.

Source confirmed by the owner: threejsassets.com, purchased Pack Commercial License. [Published license](https://threejsassets.com/license#pack-commercial-license), checked September 30, 2026. Covered assets may be used in commercial/client projects; raw-file redistribution is prohibited. Assume this local pack is covered by the owner's purchase. Assets and generated production outputs are Git-ignored. Original files are unchanged.

Dimensions below are accessor bounds (X × Y × Z), before node translations; translations do not alter these dimensions. No original names or folders were changed.

| File | Bytes | Dimensions | Compression |
| --- | ---: | --- | --- |
| barrel.glb | 6,088 | 0.5 × 0.55 × 0.52 | Draco |
| birch-tree.glb | 5,660 | 2.28 × 4.97 × 2.18 | Draco |
| boardwalk-plank.glb | 6,060 | 4 × 0.56 × 4 | Draco |
| boathouse-naust.glb | 9,796 | 4.55 × 3.95 × 9.8 | Draco |
| boulder.glb | 5,004 | 1.92 × 1.11 × 1.63 | Draco |
| cooking-hearth.glb | 5,492 | 1.26 × 1.29 × 1.24 | Draco |
| dirt-path-ground.glb | 3,988 | 4 × 0.54 × 4 | Draco |
| faering-rowboat.glb | 7,112 | 1.32 × 1.18 × 4.95 | Draco |
| fish-drying-rack.glb | 13,556 | 3.6 × 2.66 × 1.6 | Draco |
| fjord-cliff-rock.glb | 5,468 | 3.79 × 3.65 × 3.01 | Draco |
| fjord-turf-tile.glb | 4,624 | 4 × 0.55 × 4 | Draco |
| grass-tuft.glb | 4,100 | 0.51 × 0.76 × 0.45 | Draco |
| great-hall.glb | 12,016 | 5.95 × 5.44 × 8.28 | Draco |
| ground-slope-tile.glb | 5,592 | 4 × 1.64 × 4 | Draco |
| harbor-marker-post.glb | 5,136 | 0.66 × 2.83 × 0.59 | Draco |
| hay-bale.glb | 3,496 | 1.14 × 0.63 × 0.74 | Draco |
| heather-shrub.glb | 5,208 | 0.9 × 0.56 × 1.0 | Draco |
| jetty-pier.glb | 6,108 | 4 × 1.46 × 4 | Draco |
| log-pile.glb | 4,792 | 2.85 × 1.24 × 2.03 | Draco |
| longship-drakkar.glb | 11,940 | 3.48 × 5.2 × 14.47 | Draco |
| market-stall.glb | 4,604 | 2.04 × 2.24 × 1.22 | Draco |
| palisade-corner.glb | 8,460 | 2.46 × 3.71 × 2.36 | Draco |
| palisade-gate.glb | 11,300 | 4.13 × 4.1 × 1.36 | Draco |
| palisade-torch.glb | 5,236 | 0.5 × 2.34 × 0.54 | Draco |
| palisade-wall.glb | 7,276 | 4.09 × 3.24 × 1.03 | Draco |
| road-dirt-4way.glb | 5,500 | 4 × 0.54 × 4 | Draco |
| road-dirt-corner.glb | 5,104 | 4 × 0.55 × 4 | Draco |
| road-dirt-straight.glb | 3,092 | 4 × 0.55 × 4 | Draco |
| road-dirt-t.glb | 4,096 | 4 × 0.55 × 4 | Draco |
| rock-cluster.glb | 5,948 | 1.56 × 0.66 × 1.57 | Draco |
| runestone.glb | 6,500 | 1.21 × 2.46 × 1.26 | Draco |
| shield-rack.glb | 5,172 | 2 × 1.15 × 0.52 | Draco |
| shore-corner-in-fjord.glb | 6,004 | 4 × 0.55 × 4.05 | Draco |
| shore-corner-out-fjord.glb | 6,284 | 4 × 0.55 × 4 | Draco |
| shore-straight-fjord.glb | 5,536 | 4 × 0.55 × 4 | Draco |
| sky-aurora-night-dome.glb | 13,844 | 5.2 × 2.62 × 5.08 | Draco |
| sky-fjord-day-dome.glb | 8,100 | 5.2 × 2.6 × 5.07 | Draco |
| smithy-forge.glb | 10,896 | 3.6 × 3.21 × 2.94 | Draco |
| spruce-tree.glb | 3,556 | 2.59 × 6.21 × 2.63 | Draco |
| stabbur-storehouse.glb | 12,412 | 3.16 × 4.58 × 4.42 | Draco |
| standing-stone-ring.glb | 13,252 | 7.08 × 3.09 × 6.7 | Draco |
| storage-crate.glb | 4,640 | 0.77 × 0.63 × 0.64 | Draco |
| stream-beck.glb | 8,064 | 4 × 0.67 × 4 | Draco |
| turf-dwelling.glb | 10,292 | 3.61 × 3.91 × 4.34 | Draco |
| village-well.glb | 5,568 | 1.57 × 2.2 × 1.33 | Draco |
| water-open-fjord.glb | 2,388 | 4 × 0.12 × 4 | Draco |
| waypost.glb | 5,352 | 1.04 × 2.24 × 1.06 | Draco |
