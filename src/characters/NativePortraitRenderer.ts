import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight,
    PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { meshyHumanFactory } from './MeshyHuman';
import { anchorPoint, closestSurface } from './MeshyBodyFitAdapter';
import type { PortraitRequest } from './CharacterPortraits';

/** Fixed three-quarter PNG of the actual native rig, source skin and fitted modules.
 * GPU resources live only for a request burst, never alongside every card. */
export class NativePortraitRenderer {
    private renderer?: WebGLRenderer;
    private scene = new Scene();
    private camera = new PerspectiveCamera(30, 1, .01, 30);

    constructor() {
        this.scene.background = new Color('#243e45');
        this.scene.add(new HemisphereLight(0xe1edff, 0x5c5547, 2.2));
        const key = new DirectionalLight(0xffe3bd, 3);
        key.position.set(2, 4, 4);
        const rim = new DirectionalLight(0xa8d8f0, 2);
        rim.position.set(-3, 2, -2);
        this.scene.add(key, rim);
    }

    async render(input: PortraitRequest): Promise<string> {
        const human = await meshyHumanFactory.create(input.dna, 0, input.profile,
            input.presentation, input.face);
        try {
            human.sampleAnimation('Idle', .4);
            this.scene.add(human.root);
            human.root.updateMatrixWorld(true);
            const posed = human.fit.surface('posed');
            const landmark = (point: number[]) => anchorPoint(posed,
                closestSurface(human.fit.source, new Vector3(...point), ['HEAD']))
                .applyMatrix4(human.fit.mesh.matrixWorld);
            const chin = landmark([0, 1.45, .11]);
            const forehead = landmark([0, 1.60, .12]);
            const across = landmark([.045, 1.54, .12]).sub(landmark([-.045, 1.54, .12])).normalize();
            const up = forehead.clone().sub(chin).normalize();
            const forward = new Vector3().crossVectors(across, up).normalize();
            const target = chin.clone().lerp(forehead, .6);
            const height = human.root.userData.universalHumanProfile.height as number;
            const distance = .56 * Math.max(.75, height / 1.4);
            this.camera.position.copy(target)
                .addScaledVector(forward, Math.SQRT1_2 * distance)
                .addScaledVector(across, Math.SQRT1_2 * distance)
                .addScaledVector(up, distance * .03);
            this.camera.lookAt(target);
            this.renderer ??= new WebGLRenderer({ antialias: true });
            this.renderer.setSize(Math.round(256 * Math.min(1.5, Math.max(1, input.pixelRatio ?? 1))),
                Math.round(256 * Math.min(1.5, Math.max(1, input.pixelRatio ?? 1))), false);
            this.renderer.toneMapping = ACESFilmicToneMapping;
            this.renderer.render(this.scene, this.camera);
            return this.renderer.domElement.toDataURL('image/png');
        } finally {
            human.root.removeFromParent();
            human.dispose();
        }
    }

    dispose() {
        this.renderer?.dispose();
        this.renderer?.forceContextLoss();
        this.renderer = undefined;
        this.scene.clear();
    }
}
