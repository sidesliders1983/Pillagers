// Opt-in visual proof stage; never imported by the production app.
import * as THREE from 'three';
import { MeshyHumanFactory } from '../../src/characters/MeshyHuman.ts';
import { generateCharacterDNA } from '../../src/characters/generateCharacterDNA.ts';
import { universalHumanProfile } from '../../src/characters/UniversalHumanProfile.ts';
import { fjordClothingSets } from '../../src/fjord-play/FjordWardrobe.ts';

export async function createFitStage() {
    window.__fjordAudit.references.setPlayback(false);
    window.__fjordAudit.flags.manualClock = true;
    window.__fjordAudit.references.renderer.setAnimationLoop(null);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(720, 800);
    renderer.setClearColor('#b9bec2');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    document.body.replaceChildren(renderer.domElement);
    document.body.style.cssText = 'margin:0;background:#b9bec2;overflow:hidden';
    renderer.domElement.style.cssText = 'display:block;margin:auto';
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#5d6672', 2));
    const light = new THREE.DirectionalLight('#fff4e5', 3);
    light.position.set(3, 5, 4); scene.add(light);
    const fill = new THREE.DirectionalLight('#d9e6ff', 1.2);
    fill.position.set(-3, 2, -3); scene.add(fill);
    const factory = new MeshyHumanFactory();
    let human;
    const draw = async (spec, view = 'front', mobile = false) => {
        human?.root.removeFromParent();
        human?.dispose();
        const initial = { ...generateCharacterDNA(spec.seed || 1983), sex: spec.sex, age: spec.age,
            morphology: { height: spec.height || 1.5, masculinity: spec.sex === 'female' ? .2 : .85 } };
        const presentation = age => ({ ...fjordClothingSets[age < 18 ? 'native' : spec.outfit || 'generic'],
            ...(spec.hair ? { hair: 'hair/meshy-short-angular',
                beard: spec.sex === 'male' && age >= 18 ? 'beard/meshy-compact-wedge' : 'none',
                ...(!spec.autoColor ? { hairColor: spec.hairColor || '#512c1e' } : {}) } : {}) });
        human = await factory.create(initial, spec.lod ?? 2, undefined, presentation(initial.age));
        scene.add(human.root);
        human.setAnimation('Walk'); human.sample(.27);
        const next = { ...initial, age: spec.age + 1 };
        const retained = human.applyDNA(next);
        const profile = universalHumanProfile(next);
        const growth = .4 + .6 * Math.min(16, next.age) / 16;
        human.root.scale.setScalar(growth / (1 - .35 * profile.weights.Child));
        if (JSON.stringify(presentation(initial.age)) !== JSON.stringify(presentation(next.age)))
            await factory.equip(human, presentation(next.age));
        human.sampleAnimation(spec.clip || 'Walk', .43);
        human.root.updateMatrixWorld(true); human.fit.nativeSkeleton.update();
        const box = new THREE.Box3().setFromObject(human.root, true);
        const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const width = mobile ? 390 : 720, height = mobile ? 780 : 800;
        renderer.setSize(width, height);
        const camera = new THREE.PerspectiveCamera(35, width / height, .01, 50);
        const detail = view === 'detail', extent = detail ? size.y * .37 : size.y;
        const target = detail ? new THREE.Vector3(centre.x, box.max.y - size.y * .18, centre.z) : centre;
        const distance = extent / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.15;
        const angle = view === 'side' ? .9 : .15;
        camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle) * distance, .03, Math.cos(angle) * distance));
        camera.lookAt(target); camera.updateMatrixWorld(true);
        renderer.render(scene, camera);
        // The full-body box centre can lie in the empty gap between a farmer's legs.
        // Test an actual chest/head pixel while keeping identical full-body camera framing.
        const pickingTarget = detail ? target : new THREE.Vector3(centre.x, box.min.y + size.y * .7, centre.z);
        const hits = new THREE.Raycaster(camera.position, pickingTarget.clone().sub(camera.position).normalize()).intersectObject(human.root, true);
        return { spec, view, mobile, retained, age: human.dna.age,
            profile: human.root.userData.universalHumanProfile, selected: human.root.userData.selectedAssets,
            bounds: { min: box.min.toArray(), max: box.max.toArray() }, hitCount: hits.length,
            firstHit: hits[0]?.distance, pickingTarget: pickingTarget.toArray(), draw: { ...renderer.info.render }, memory: { ...renderer.info.memory },
            modules: [...human.fit.modules.keys()], source: human.fit.body };
    };
    return { draw, dispose() { human?.dispose(); renderer.dispose(); } };
}
