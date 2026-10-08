# Dan Greenheck resources — bounded assessment, 2026-10-08

Owner asked whether https://github.com/dgreenheck contains useful resources for the supplied fjord references. This is an assessment, not authorization to replace the locked #57/#58 sources.

| Resource | Verified capability/source | Potential fit | Decision now |
| --- | --- | --- | --- |
| [EZ-Tree](https://github.com/dgreenheck/ez-tree) | MIT; configurable trees; PNG/GLB export; same-skeleton LODs; flat/textured bark options; Three.js library | Candidate for richer conifer crowns and background forest, subject to silhouette comparison and mobile cost | Keep KayKit selection; propose a bounded comparison if owner chooses another tree source |
| [Environment Map](https://github.com/dgreenheck/threejs-environment-map) | MIT demo; RGBELoader, HDR sky in scene.environment, material envMapIntensity, native tone mapping | Consistent sky illumination/material response, warm/cool cohesion | Useful rendering reference; static HDR environment does not automatically reflect our current houses/rocks |
| [Tidewater](https://github.com/dgreenheck/tidewater) | MIT engine code, separately credited third-party assets; raw WebGPU/WGSL engine; atmosphere/haze, contact shadows, AO, FFT ocean | Strong atmosphere/coastal composition reference | Not a Three.js drop-in; requires capable GPU and substantial engine integration; don't copy its tropical world or replace current water in these slices |
| [Vibecode RPG](https://github.com/dgreenheck/threejs-vibecode-rpg) | MIT; procedural/chunked low-poly world and decoration | Example of chunking/placement | Does not supply the exact authored fjord scenery; current terrain/parcels remain canonical |

My assessment: the strongest likely visual gains are richer tree crowns, layered atmospheric background and contact-lighting/depth, rather than adding more grass. None of these repositories alone provides the missing authored cliff backdrop. No newly authored shader or source substitution has been introduced.

Historical links to dgreenheck/threejs-water-shader currently return 404; mirrored forks are not adopted as a verified publisher source. Licenses/compatibility would be pinned to exact commits before any future import. The code licenses do not automatically cover all demo assets; use each repository's credits/source notices.
