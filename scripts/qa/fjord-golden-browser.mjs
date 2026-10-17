// Loaded exclusively by the opt-in QA server. Production has no capture clock or API.
export const golden = {
    frozen: true,
    time: 0,
    bind(audit) {
        this.audit = audit;
        audit.golden = this;
        const renderer = audit.references.renderer;
        const render = renderer.render.bind(renderer);
        renderer.info.autoReset = false;
        renderer.render = (...args) => {
            renderer.info.reset();
            return render(...args);
        };
    },
    async capture({ time = 0, camera, selection = null } = {}) {
        if (!Number.isFinite(time) || time < 0) throw Error('Invalid golden effects time');
        const refs = this.audit.references;
        if (!document.querySelector('#fjord-canvas')?.dataset.ready)
            throw Error('The production scene is not ready');
        refs.setPlayback(false);
        this.frozen = true;
        this.time = time;
        refs.shared.select(selection);
        refs.refresh();
        await refs.settle();
        if (camera) refs.controller.setView(camera);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        refs.scene.updateMatrixWorld(true);
        const actors = [...refs.models.actors].map(([root, actor]) => ({
            id: root.name,
            position: root.position.toArray(),
            rotation: root.quaternion.toArray(),
            scale: root.scale.toArray(),
            state: actor.state,
            animationTime: actor.human?.mixer.time ?? actor.mixer?.time ?? null,
        }));
        return {
            version: 'fjord-golden-v1',
            servedSource: this.audit.servedSource,
            canonicalJSON: refs.session.saveJSON(),
            blueprintJSON: JSON.stringify(refs.campaign.blueprint),
            calendar: refs.campaign.readProjection().calendar,
            effectsTime: this.time,
            actors,
            camera: {
                position: refs.camera.position.toArray(), target: refs.controller.focus.toArray(),
                fov: refs.camera.fov, aspect: refs.camera.aspect,
                projection: refs.camera.projectionMatrix.toArray(),
            },
            quality: document.querySelector('#fjord-quality').value,
            effects: document.querySelector('#fjord-effects').value,
            lighting: {
                sun: refs.lighting.directional.color.toArray(),
                intensity: refs.lighting.directional.intensity,
                ambient: refs.lighting.ambient.intensity,
                fog: { near: refs.lighting.fog.near, far: refs.lighting.fog.far },
                shadowMaps: refs.scene.children.filter(node => node.isLight && node.castShadow)
                    .map(node => node.shadow.mapSize.toArray()),
            },
            renderer: {
                callsIncludingShadows: refs.renderer.info.render.calls,
                trianglesIncludingShadows: refs.renderer.info.render.triangles,
                geometries: refs.renderer.info.memory.geometries,
                textures: refs.renderer.info.memory.textures,
                pixelRatio: refs.renderer.getPixelRatio(),
                width: refs.renderer.domElement.width, height: refs.renderer.domElement.height,
            },
            placeholders: refs.layer.describe().filter(entity => entity.placeholder).map(entity => entity.key),
            modelDiagnostics: refs.models.diagnostics,
        };
    },
};
