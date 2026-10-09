# EZ-Tree leaf wind adapter

Source: dgreenheck/ez-tree, revision dcf309bd86bd521083d9c70f01f2de45fdc7c457, MIT.
The vertex callback is extracted from the pinned src/lib/tree.js leaf-material factory.
Source SHA256: a1b7bd933cb2078e9373c9c853c620be8a3edc84a9edda6a4073c8ad2a31f934.
The complete original and source lock remain in scripts/qa/vendor/ez-tree.

Compatibility addition: the stock Three.js instanceMatrix transform is applied after the upstream local-space sway and before modelViewMatrix. Without this, instanced leaf crowns render at the model origin. Original noise and sway math are unchanged. The optional rounded-normal fragment override is omitted; native source GLTF material appearance remains intact.

Published uniform tuning: strength (1,0,1), frequency 0.9, source scale 70. In the approved Large model normalized to at most 10.774m from 68.516m, maximum leaf displacement is below 0.223m, within the saved 0.25m nature padding. Tree trunks and roots do not move. Static shadow silhouettes are retained, matching upstream's lack of a matching custom depth wind pass.

Noise attribution: the upstream callback cites https://github.com/ashima/webgl-noise. Its MIT copyright/permission notice is preserved in WEBGL-NOISE-LICENSE.
