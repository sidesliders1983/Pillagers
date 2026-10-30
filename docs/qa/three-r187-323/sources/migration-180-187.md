## 186 → 187

- In TSL, operands and parameters of math functions are implicitly coerced to broader common types now, see [#33695](https://github.com/mrdoob/three.js/pull/33695).
- PMREMs are now based on cube render targets, see [#34585](https://github.com/mrdoob/three.js/pull/34585). `CubeUVReflectionMapping` has been removed. The overall quality of PMREMs has been improved as well so materials will look slightly different with the new implementation.
- `WebGPURenderer` and `WebGLRenderer` internally make use of `WeakRef` and `FinalizationRegistry` now, see [#34368](https://github.com/mrdoob/three.js/pull/34368).
- The XR camera's transformation and projection matrix are derived from the first sub camera (e.g. the left eye in a stereo setup), see [#34275](https://github.com/mrdoob/three.js/pull/34275).
- `WebGLRenderer.setViewport()` and `WebGLRenderer.setScissor()` no longer scale by pixel ratio when a render target is bound, see [#34460](https://github.com/mrdoob/three.js/pull/34460).
- The `pixelSize` parameter of the `pixelationPass()` TSL function is now just a `Number`, see [#34543](https://github.com/mrdoob/three.js/pull/34543). Node objects are not supported anymore.
- Registering a light in `WebGPURenderer` works now differently. Instead of using `renderer.library.addLight( CustomLightNode, CustomLight );` it is now `CustomLight.registerNode( CustomLightNode );`, see [#34622](https://github.com/mrdoob/three.js/pull/34622).
- TSL now always treats struct storage buffers as arrays, even when they contain a single element. Replace direct member access such as `storage.get( 'member' )` with `storage.element( 0 ).get( 'member' )` if used `storage( buffer, StructType )`, see [#34807](https://github.com/mrdoob/three.js/pull/34807).
- `MeshPhysicalMaterial.iridescenceThicknessRange` has been deprecated. It's now `iridescenceThicknessMinimum` and `iridescenceThicknessMaximum`, see [#35039](https://github.com/mrdoob/three.js/pull/35039).

## 185 → 186

- `Object3D` has now a `dispose()` method, see [#34141](https://github.com/mrdoob/three.js/pull/34141). If you have custom 3D object types in your project with `dispose()` methods, make sure to call `super.dispose();` in their implementations.
- The distance model of `GTAONode` has been improved which means `distanceExponent` and `distanceFallOff` are deprecated and have no effect on the AO anymore, see [#33895](https://github.com/mrdoob/three.js/pull/33895).
- `BufferGeometryUtils.toTrianglesDrawMode()` does not clone the given geometry anymore, see [#33878](https://github.com/mrdoob/three.js/pull/33878). Instead, the geometry's index is changed "in-place". To restore the previous behavior, do a manual `clone()` before calling the function.
- `LightProbeGrid` has been renamed to `LightProbeGridWebGL`. `LightProbeGridHelper` is now `LightProbeGridHelperWebGL`. The free names will be used for the `WeGPURenderer` version, see [#33911](https://github.com/mrdoob/three.js/pull/33911).
- `PCFSoftShadowMap` with `WebGPURenderer` has been removed, see [#33987](https://github.com/mrdoob/three.js/pull/33987). Use `PCFShadowMap` which is now soft as well.
- `SimplifyModifier` has a new implementation based on `meshoptimizer` which means it produces a different simplified mesh now. Besides, `SimplifyModifier.modify()` is now async, see [#34021](https://github.com/mrdoob/three.js/pull/34021).
- `Source` has been renamed to `TextureSource`, see [#34202](https://github.com/mrdoob/three.js/pull/34202).
- The `up` uniform of `Sky` and `SkyMesh` has been removed. The component always assume +Y up now.
- The `angle`, `amount` and `scale` parameters of `DotScreenNode` and `RGBShiftNode` can be numbers or node objects now, see [#34417](https://github.com/mrdoob/three.js/pull/34417). When passing numbers to the ctor, the implementation converts the to node constant now.

## 184 → 185

- `WebGPURenderer` has changed how premultiplied alpha is implemented, see [#33369](https://github.com/mrdoob/three.js/issues/33369). If you experience blending issues after the upgrade, configure an opaque background color via `Scene.background` or by using an opaque clear color via `renderer.setClearColor()`. Only use transparent background or clear colors if your application has to blend with the HTML background.
- The `clearColor` and `clearAlpha` properties of `SSAAPassNode` have been removed, see [#33478](https://github.com/mrdoob/three.js/pull/33478). Clear colors must be set over the renderer.
- `SVGLoader.createShapes()` has been deprecated. Use `shapePaths.toShapes()` instead, see [#33503](https://github.com/mrdoob/three.js/pull/33503).
- `AnamorphicNode` has been removed. Use `BloomNode` like demonstrated in [#33600](https://github.com/mrdoob/three.js/pull/33600).
- `DRACOLoader.setDecoderConfig()` has been deprecated, see [#33602](https://github.com/mrdoob/three.js/pull/33602). In the future, `DRACOLoader` will always using WASM.
- `PLYLoader` now honors the PLY data types when creating buffer attributes, see [#33622](https://github.com/mrdoob/three.js/pull/33622). If your PLY files hold `float64`/`double` data fields, the loader produces now buffer attributes with `Float64Array`. If you want to render such data, you must convert the attributes to `Float32BufferAttribute`.
- `PLYExporter` now honors the buffer attribute data type when creating a PLY file, see [#33625](https://github.com/mrdoob/three.js/pull/33625). If you experience compatibility issues with exported PLY files, please update the buffer attribute type of your geometries. This is most likely to happen with vertex colors. Only color attributes with `Uint8Array` are going to be exported to `uchar`.
- `GTAONode` computes now a more physically correct ambient occlusion, see [#33654](https://github.com/mrdoob/three.js/pull/33654). However, the new AO tends to be darker and reaches wider than the previous one. Consider to lower `radius` and `scale` as a compensation.
- `LWOLoader` has been deprecated, see [#33621](https://github.com/mrdoob/three.js/pull/33621).
- In TSL `positionLocal` does not update internal vertex transformations such as `SkinnedMesh` when used in `material.positionNode`. Use `positionGeometry` to get the vertices from the pre-transformed geometry.
- The TSL function `directionToColor()` has been renamed to `packNormalToRGB()`, see [#33715](https://github.com/mrdoob/three.js/pull/33715).
- The TSL function `colorToDirection()` has been renamed to `unpackRGBToNormal()`, see [#33715](https://github.com/mrdoob/three.js/pull/33715).
- In the WebGL shaders, `inverseTransformDirection()` has been deprecated, see [#33351](https://github.com/mrdoob/three.js/pull/33351). Use `transformNormalByInverseViewMatrix()` to transform a normal vector, and use `transformDirectionByInverseViewMatrix()` to transform a direction vector.
- `Object3D.updateWorldMatrix()` now honors the `Object3D.matrixWorldNeedsUpdate` flag, see [#33746](https://github.com/mrdoob/three.js/pull/33746). Whenever you set `Object.matrixAutoUpdate` to `false` and directly update `Object3D.matrix`, you must set `Object3D.matrixWorldNeedsUpdate` to `true` to indicate a world matrix update is required.
- `TiledLighting` has been removed, see [#33751](https://github.com/mrdoob/three.js/pull/33751). Please use `ClusteredLighting` instead.
- `Matrix3.translate()`, `Matrix3.scale()` and `Matrix3.rotate()` have been deprecated, see [#33757](https://github.com/mrdoob/three.js/pull/33757) and [#24733](https://github.com/mrdoob/three.js/pull/24733).
- `DRACOExporter.parse()` has been replaced with `DRACOExporter.parseAsync()`, see [#33789](https://github.com/mrdoob/three.js/pull/33789).
- The API of `SSRNode` has slightly changed and the implementation improved with a new optional denoiser, see [#33843](https://github.com/mrdoob/three.js/pull/33843).
- `SSGINode` has switched to a `RG11B10` internal render target and that affects the node setup. Check how the SSGI example were updated in the related PR [#33822](https://github.com/mrdoob/three.js/pull/33822).

## 183 → 184

- The background and environment map rotation has been aligned to how 3D objects are rotated, see [#33077](https://github.com/mrdoob/three.js/pull/33077) and [#33232](https://github.com/mrdoob/three.js/pull/33232).
- `FirstPersonControls` has a new interaction model and improved mobile support, see [#33124](https://github.com/mrdoob/three.js/pull/33124).
- If you manually define pixel storage values over the raw WebGL 2 rendering context, use `renderer.state.pixelStorei()` now, see [#33227](https://github.com/mrdoob/three.js/pull/33227).
- `FBXLoader` now automatically converts +Z-up models into +Y-up. Manual rotations on app level can be removed.
- `VTKLoader` has been deprecated, see [#33363](https://github.com/mrdoob/three.js/pull/33363).
- `FileLoader.load()` and `ImageBitmapLoader.load()` have no return value anymore. Always use the `onLoad()` callback to retrieve the file or image bitmap, see [#33380](https://github.com/mrdoob/three.js/pull/33380).

## 182 → 183

- `PostProcessing` has been renamed to `RenderPipeline`.
- The blend of `SSRNode` has been changed. Instead of using `blendColor()`, use additive blending to blend SSR reflections with the scene pass.
- `Clock` has been deprecated. Please use `Timer` instead.
- The shadows in `WebGPURenderer` have been improved. It might be necessary to remove  or decrease shadow bias values that were previously necessary to mitigate shadow acne.
- The scene position of `RoomEnvironment` has been updated. When using `RoomEnvironment` to generate a PMREM, the resulting lighting will look different now. More details in:  [#32646](https://github.com/mrdoob/three.js/pull/32646)
- A legacy gamma correction of `Sky` and `SkyMesh` has been removed. The effect looks different compared to previous versions and it is not possible to restore the previous look with a different parameterization. More details in: [#32677](https://github.com/mrdoob/three.js/pull/32677)
- `MeshPostProcessingMaterial` has been removed.
- `WebGLCubeRenderTarget` can't be used with `WebGPURenderer` anymore. Please use `CubeRenderTarget` instead. More details in: [#32871](https://github.com/mrdoob/three.js/pull/32871)

## 181 → 182

- `PCFSoftShadowMap` with `WebGLRenderer` is now deprecated. Use `PCFShadowMap` which is now soft as well.
- The `colorBufferType` parameter of `WebGPURenderer` has been renamed to `outputBufferType`. `getColorBufferType()` has been renamed to `getOutputBufferType()`.
- `VOXLoader.load()` has been changed. The result object in the `onLoad()` callback now holds a scene with parsed meshes. [#32488](https://github.com/mrdoob/three.js/pull/32488)

## 180 → 181

- The way indirect specular light for PBR materials is computed has been improved. This change slightly changes the overall appearance of PBR materials. More details in: [#32054](https://github.com/mrdoob/three.js/pull/32054)
- PBR materials now better conserve energy, primarily rough materials (roughness > 0.5) which leads to more physically correct results. That means rough materials tend to be a bit brighter than in previous versions. More details in: [#32072](https://github.com/mrdoob/three.js/pull/32072)
- PMREM reflections have been improved. More details in: [#32102](https://github.com/mrdoob/three.js/pull/32102) and [#32134](https://github.com/mrdoob/three.js/pull/32134).
- `renderAsync()` and `computerAsync()` of `WebGPURenderer` as well as other async methods like `clearAsync()`, `initTextureAsync()` or `hasFeatureAsync()` have been deprecated. Before the sync versions of the methods can be called, the instance of `WebGPURenderer` must be initialized. That happens automatically inside your animation loop defined via `renderer.setAnimationLoop()` or manually if you call `await renderer.init()`. The latter call might be necessary if you use on-demand rendering or perform feature detection.
- `waitForGPU()` has been removed from `WebGPURenderer`. Read [#32012](https://github.com/mrdoob/three.js/issues/32012) for details.
- `KTX2Loader.detectSupportAsync()` has been deprecated. Use `detectSupport()` instead after the renderer has been initialized via `await renderer.init()`.
- The TSL object `PI2` has been renamed to `TWO_PI`.
- The internal AO render target of `GTAONode` has been optimized. The AO is now only accessible in the `r` channel. The AO blend on application level should use this formula now: `vec4( scenePassColor.rgb.mul( aoPass.r ), scenePassColor.a );`
- The methods `setResolution()` and `getResolution()` of `PassNode` have been renamed to `setResolutionScale()` and `getResolutionScale()`.
- The `damp` property of `AfterImageNode` is now of type `Node<float>`. When creating an effect node via `afterImage()`, it is not required to pass in a number anymore. A node constant or a uniform node are accepted as well.
- The `resolution` property of `WaterMesh` has been renamed to `resolutionScale`.
- three.js has a new API documentation which is now generated based on JSDoc. The new documentation covers the entire API, provides a better search and better type information. However, i18n (internationalization) isn't supported anymore meaning the docs are only available in English.

