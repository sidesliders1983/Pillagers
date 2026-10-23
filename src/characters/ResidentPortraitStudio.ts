import { ACESFilmicToneMapping, Color, DirectionalLight, HalfFloatType, HemisphereLight,
    PerspectiveCamera, Scene, SRGBColorSpace, Vector3, Vector4, WebGLRenderTarget,
    type WebGLRenderer } from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { BodySurface, SurfaceAnchor } from './BodyFitAdapter';
import { meshyHumanFactory, type MeshyHuman } from './MeshyHuman';
import { closestSurface } from './MeshyBodyFitAdapter';
import type { PortraitRequest } from './CharacterPortraits';
import { worldResidentDetail } from '../config/PresentationQuality';

const anchors = new WeakMap<BodySurface, SurfaceAnchor[]>();

/** Evaluate just the twelve source corners framing the head, not a posed copy
 * of every body vertex. Native coverage retains these source correspondences. */
function headFrame(human: MeshyHuman) {
    const fit = human.fit;
    let points = anchors.get(fit.source);
    if (!points) {
        points = [[0, 1.45, .11], [0, 1.60, .12], [.045, 1.54, .12], [-.045, 1.54, .12]]
            .map(point => closestSurface(fit.source, new Vector3(...point), ['HEAD']));
        anchors.set(fit.source, points);
    }
    const geometry = fit.mesh.geometry;
    try {
        fit.mesh.geometry = fit.sourceGeometry;
        const posed = points.map(anchor => {
            const point = new Vector3();
            for (let corner = 0; corner < 3; corner++) {
                const vertex = fit.source.indices[anchor.triangle * 3 + corner];
                point.addScaledVector(fit.mesh.getVertexPosition(vertex, new Vector3()), anchor.barycentric[corner]);
            }
            return point.applyMatrix4(fit.mesh.matrixWorld);
        });
        const [chin, forehead, right, left] = posed;
        const across = right.sub(left).normalize();
        const up = forehead.clone().sub(chin).normalize();
        return { target: chin.lerp(forehead, .6), across, up,
            forward: new Vector3().crossVectors(across, up).normalize() };
    } finally {
        fit.mesh.geometry = geometry;
    }
}

function png(pixels: Uint8Array, size: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Portrait image encoding is unavailable.');
        const image = context.createImageData(size, size);
        image.data.set(pixels);
        context.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    } finally {
        canvas.width = canvas.height = 0;
    }
}

/** On-demand avatar using the live rig and the caller's existing renderer.
 * No model loading, refitting, animation sampling or additional WebGL context.
 * Borrowing the model is synchronous, with scene/render state restored on error. */
export class ResidentPortraitStudio {
    private scene = new Scene();
    private camera = new PerspectiveCamera(30, 1, .01, 30);
    private key = new DirectionalLight(0xffe3bd, 3);
    private rim = new DirectionalLight(0xa8d8f0, 2);
    private target?: WebGLRenderTarget;
    private output?: WebGLRenderTarget;
    private outputPass = new OutputPass();
    private pixels = new Uint8Array();
    private upright = new Uint8Array();
    private disposed = false;

    constructor(private renderer: WebGLRenderer,
        private encode: (pixels: Uint8Array, size: number) => string = png,
        private create: (input: PortraitRequest) => Promise<MeshyHuman> = input =>
            meshyHumanFactory.create(input.dna, worldResidentDetail.lod, input.profile,
                input.presentation, input.face),
        private draw: (operation: () => void) => void = operation => operation()) {
        this.scene.background = new Color('#243e45');
        this.scene.add(new HemisphereLight(0xe1edff, 0x5c5547, 2.2),
            this.key, this.rim, this.key.target, this.rim.target);
    }

    async render(input: PortraitRequest, resident?: MeshyHuman) {
        if (this.disposed) return undefined;
        if (resident) return this.capture(resident, input.pixelRatio);
        // An archived/indoor resident may have no live world model. Keep that
        // portrait on the same renderer and existing world LOD, with owned cleanup.
        const historical = await this.create(input);
        try {
            if (this.disposed) return undefined;
            historical.sampleAnimation('Idle', .4);
            return this.capture(historical, input.pixelRatio);
        } finally {
            historical.dispose();
        }
    }

    capture(human: MeshyHuman, pixelRatio = 1) {
        if (this.disposed) throw new Error('Portrait studio is disposed.');
        const size = Math.round(128 * Math.min(1.5, Math.max(1, pixelRatio)));
        if (!this.target || this.target.width !== size) {
            this.target?.dispose();
            this.output?.dispose();
            this.target = new WebGLRenderTarget(size, size, { type: HalfFloatType });
            this.output = new WebGLRenderTarget(size, size, { depthBuffer: false });
            this.pixels = new Uint8Array(size * size * 4);
            this.upright = new Uint8Array(this.pixels.length);
        }
        const { root } = human;
        root.updateWorldMatrix(true, true);
        const parent = root.parent, sibling = parent?.children.indexOf(root) ?? -1;
        const matrix = root.matrix.clone(), worldMatrix = root.matrixWorld.clone();
        const automatic = root.matrixAutoUpdate, visible = root.visible;
        const renderer = this.renderer;
        const previous = { target: renderer.getRenderTarget(), cube: renderer.getActiveCubeFace(),
            mip: renderer.getActiveMipmapLevel(), viewport: renderer.getViewport(new Vector4()),
            scissor: renderer.getScissor(new Vector4()), scissorTest: renderer.getScissorTest(),
            clear: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha(),
            toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
            colorSpace: renderer.outputColorSpace,
            autoClear: renderer.autoClear, shadows: renderer.shadowMap.enabled };
        try {
            this.scene.add(root);
            root.matrixAutoUpdate = false;
            root.matrix.copy(worldMatrix);
            root.visible = true;
            this.scene.updateMatrixWorld(true);
            const frame = headFrame(human);
            const height = human.root.userData.universalHumanProfile.height as number;
            const distance = .56 * Math.max(.75, height / 1.4) * root.getWorldScale(new Vector3()).y;
            this.camera.position.copy(frame.target)
                .addScaledVector(frame.forward, Math.SQRT1_2 * distance)
                .addScaledVector(frame.across, Math.SQRT1_2 * distance)
                .addScaledVector(frame.up, distance * .03);
            this.camera.up.copy(frame.up);
            this.camera.lookAt(frame.target);
            this.key.target.position.copy(frame.target);
            this.rim.target.position.copy(frame.target);
            this.key.position.copy(frame.target).addScaledVector(frame.across, 2)
                .addScaledVector(frame.up, 4).addScaledVector(frame.forward, 4);
            this.rim.position.copy(frame.target).addScaledVector(frame.across, -3)
                .addScaledVector(frame.up, 2).addScaledVector(frame.forward, -2);
            renderer.toneMapping = ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1;
            renderer.outputColorSpace = SRGBColorSpace;
            renderer.autoClear = true;
            renderer.shadowMap.enabled = false;
            renderer.setRenderTarget(this.target);
            // setRenderTarget uses its physical viewport. setViewport would
            // multiply that size by the world's DPR a second time on mobile.
            renderer.setScissorTest(false);
            this.draw(() => {
                renderer.render(this.scene, this.camera);
                // Three intentionally skips display tone mapping on ordinary render
                // targets. Its standard output pass applies ACES and sRGB once.
                this.outputPass.render(renderer, this.output!, this.target!, 0, false);
            });
            renderer.readRenderTargetPixels(this.output!, 0, 0, size, size, this.pixels);
            const stride = size * 4;
            for (let row = 0; row < size; row++)
                this.upright.set(this.pixels.subarray(row * stride, (row + 1) * stride), (size - 1 - row) * stride);
            return this.encode(this.upright, size);
        } finally {
            root.removeFromParent();
            root.matrixAutoUpdate = automatic;
            root.matrix.copy(matrix);
            root.visible = visible;
            if (parent) {
                parent.add(root);
                parent.children.splice(parent.children.indexOf(root), 1);
                parent.children.splice(sibling, 0, root);
            }
            root.updateMatrixWorld(true);
            renderer.setRenderTarget(previous.target, previous.cube, previous.mip);
            renderer.setViewport(previous.viewport);
            renderer.setScissor(previous.scissor);
            renderer.setScissorTest(previous.scissorTest);
            renderer.setClearColor(previous.clear, previous.alpha);
            renderer.toneMapping = previous.toneMapping;
            renderer.toneMappingExposure = previous.exposure;
            renderer.outputColorSpace = previous.colorSpace;
            renderer.autoClear = previous.autoClear;
            renderer.shadowMap.enabled = previous.shadows;
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.target?.dispose();
        this.output?.dispose();
        this.outputPass.dispose();
        this.target = undefined;
        this.output = undefined;
        this.pixels = this.upright = new Uint8Array();
        this.scene.clear();
    }
}
