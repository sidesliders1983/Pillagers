# Ground-only revision evidence

Owner references: docs/references/environment/REF-A.png and REF-B.png. Ground037/Ground054 retained; mossy_rock OpenGL normal/roughness blended into the same slope mask. GrassField OFF in default captures. Legacy tree/rock props are diagnostic and unaccepted; #58 supplies authored scenery. Water remains the sourced #56 implementation.

TDD: changed public browser expectation to optional GrassField OFF; observed assertion failure (actual true, expected false) before implementation. Public terrain/height/navigation/lighting/water checks: 14 passed. TypeScript passed. Browser capture/control results are recorded in measurements.json when completed; SwiftShader samples are software diagnostics, not the #59 hardware gate. Native atlas response alone cannot deliver the reference forest, rocky shore or mountain backdrop.

Known CI failure at inherited head: character validator reports cream-tunic LOD2 non-manifold edges (71), before tests. Validation has not been weakened. No visual sign-off or production integration is claimed.
