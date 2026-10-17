import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, HemisphereLight,
  OrthographicCamera, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

// The parsed source remains untouched: no animation player, DNA, fitting, recentering or scaling.
const canvas = document.querySelector('#reference');
const renderer = new WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(1);
renderer.setSize(1024, 1024, false);
renderer.toneMapping = ACESFilmicToneMapping;
const scene = new Scene();
scene.background = new Color('#dbe1d7');
scene.add(new HemisphereLight(0xfff3e3, 0x9caa9a, 2.2));
const sun = new DirectionalLight(0xffead5, 1.7);
scene.add(sun);
const fieldOfView = 38;
const directions = {
  front: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0],
  back: [0, 0, -1], 'front-left': [Math.SQRT1_2, 0, Math.SQRT1_2],
};
const pose = {mode: 'source-rest', animation: null, mixer: false, dnaAdjustments: false};
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  value => value.toString(16).padStart(2, '0')).join('');
const hashJSON = value => hash(new TextEncoder().encode(JSON.stringify(value)));

function typedBytes(array) {
  return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}

async function captureSourceState(model) {
  const nodes = [];
  const geometries = [];
  const materials = [];
  const geometryIds = new Set();
  const materialIds = new Set();
  model.traverse(node => {
    nodes.push({
      name: node.name, type: node.type, parent: node === model ? null : node.parent?.uuid,
      uuid: node.uuid, position: node.position.toArray(), quaternion: node.quaternion.toArray(),
      scale: node.scale.toArray(), matrix: node.matrix.toArray(), visible: node.visible,
      morphTargetInfluences: node.morphTargetInfluences ?? null,
      bindMatrix: node.bindMatrix?.toArray() ?? null,
      boneInverses: node.skeleton?.boneInverses.map(matrix => matrix.toArray()) ?? null,
    });
    if (node.geometry && !geometryIds.has(node.geometry.uuid)) {
      geometryIds.add(node.geometry.uuid);
      geometries.push(node.geometry);
    }
    for (const material of node.material ? [].concat(node.material) : []) {
      if (materialIds.has(material.uuid)) continue;
      materialIds.add(material.uuid);
      materials.push({
        uuid: material.uuid, type: material.type, color: material.color?.toArray(),
        emissive: material.emissive?.toArray(), roughness: material.roughness,
        metalness: material.metalness, opacity: material.opacity, transparent: material.transparent,
        side: material.side, flatShading: material.flatShading, vertexColors: material.vertexColors,
        maps: Object.fromEntries(Object.entries(material).filter(([, value]) => value?.isTexture)
          .map(([name, texture]) => [name, {
            uuid: texture.uuid, source: texture.source.uuid, colorSpace: texture.colorSpace,
            matrix: texture.matrix.toArray(), flipY: texture.flipY,
          }])),
      });
    }
  });
  const geometryRecords = [];
  for (const geometry of geometries) {
    const attributes = {...geometry.attributes};
    if (geometry.index) attributes.index = geometry.index;
    for (const [name, morphs] of Object.entries(geometry.morphAttributes)) {
      morphs.forEach((attribute, index) => { attributes[name + '.morph.' + index] = attribute; });
    }
    const records = {};
    for (const [name, attribute] of Object.entries(attributes)) {
      const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
      records[name] = {
        count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
        byteLength: array.byteLength, sha256: await hash(typedBytes(array)),
      };
    }
    geometryRecords.push({uuid: geometry.uuid, attributes: records, groups: geometry.groups});
  }
  return {
    geometrySha256: await hashJSON(geometryRecords), transformsSha256: await hashJSON(nodes),
    materialsSha256: await hashJSON(materials), nodes: nodes.length,
    geometries: geometries.length, materials: materials.length,
  };
}

function boxCorners(bounds) {
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
    }
  }
  return corners;
}

function projectBounds(corners, camera) {
  camera.updateMatrixWorld(true);
  const projected = corners.map(point => point.clone().project(camera));
  return {
    x: [Math.min(...projected.map(point => point.x)), Math.max(...projected.map(point => point.x))],
    y: [Math.min(...projected.map(point => point.y)), Math.max(...projected.map(point => point.y))],
    z: [Math.min(...projected.map(point => point.z)), Math.max(...projected.map(point => point.z))],
  };
}

async function loadReference() {
  const sourceURL = new URLSearchParams(location.search).get('source');
  if (!sourceURL) throw new Error('The exact GLB source URL is required.');
  const response = await fetch(sourceURL);
  if (!response.ok) throw new Error('Unable to load source GLB: HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  const sourceHash = await hash(bytes);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes, new URL('.', new URL(sourceURL, location.href)).href);
  const model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model, true);
  if (bounds.isEmpty()) throw new Error('The source GLB contains no visible geometry.');
  const size = bounds.getSize(new Vector3());
  const target = bounds.getCenter(new Vector3());
  const diagonal = size.length();
  const corners = boxCorners(bounds);
  sun.position.copy(target).add(new Vector3(-3, 6, 5).multiplyScalar(diagonal));
  sun.target.position.copy(target);
  scene.add(sun.target);

  let verticalSpan = Math.max(size.x, size.y, size.z) * 1.15;
  const makeCamera = view => {
    const distance = verticalSpan / (2 * Math.tan(fieldOfView * Math.PI / 360));
    const near = Math.max(0.0001, distance / 10000);
    const far = distance + diagonal * 4;
    const camera = view === 'front-left' ? new PerspectiveCamera(fieldOfView, 1, near, far) :
      new OrthographicCamera(-verticalSpan / 2, verticalSpan / 2,
        verticalSpan / 2, -verticalSpan / 2, near, far);
    camera.position.copy(target).addScaledVector(new Vector3(...directions[view]), distance);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    return camera;
  };
  // Use one framing scale for every view. A conservative projected source box protects raised arms.
  for (let attempt = 0; attempt < 100; attempt++) {
    const projected = projectBounds(corners, makeCamera('front-left'));
    const maximum = Math.max(...[...projected.x, ...projected.y].map(Math.abs));
    if (maximum <= 0.90 && projected.z.every(value => Math.abs(value) < 1)) break;
    verticalSpan *= 1.05;
    if (attempt === 99) throw new Error('Unable to frame the source without clipping.');
  }
  const baseline = await captureSourceState(model);
  const source = {url: sourceURL, sha256: sourceHash, bytes: bytes.byteLength};
  const framing = {
    width: 1024, height: 1024, deviceScaleFactor: 1, orthographicVerticalSpan: verticalSpan,
    perspectiveTargetVerticalSpan: verticalSpan, target: target.toArray(),
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray()},
    note: 'Camera target follows the unmodified source bounds. The model is not recentered or scaled.',
  };
  window.neutralReference = {
    source, pose, framing, baseline,
    async capture(view) {
      if (!Object.hasOwn(directions, view)) throw new Error('Unknown reference view: ' + view);
      const before = await captureSourceState(model);
      if (JSON.stringify(before) !== JSON.stringify(baseline)) throw new Error('Source state changed.');
      const camera = makeCamera(view);
      renderer.render(scene, camera);
      const after = await captureSourceState(model);
      if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error('Rendering changed source state.');
      const projectedBounds = projectBounds(corners, camera);
      if ([...projectedBounds.x, ...projectedBounds.y, ...projectedBounds.z]
        .some(value => Math.abs(value) >= 1)) throw new Error('Source bounds clipped: ' + view);
      return {
        source, pose, view, framing, before, after, projectedBounds,
        camera: {
          type: view === 'front-left' ? 'perspective' : 'orthographic',
          scale: view === 'front-left' ? null : verticalSpan, fov: fieldOfView,
          position: camera.position.toArray(), target: target.toArray(),
        },
        validations: {nativeNeutralPose: true, sourceGeometryUnchanged: true,
          sourceTransformsUnchanged: true, sourceMaterialsUnchanged: true, fullyFramed: true},
      };
    },
  };
  await window.neutralReference.capture('front');
  canvas.dataset.ready = 'true';
}

loadReference().catch(error => {
  window.neutralReferenceError = error.stack ?? error.message;
  canvas.dataset.error = error.message;
  console.error(error);
});
