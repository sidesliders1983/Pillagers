import { MathUtils } from 'three';
import { daylight } from '/src/config/timeVisualization.ts';
import { fjordFogPresentation } from '/src/config/FjordFog.ts';

// Loaded only by QA_FOG_STUDY=1 on the loopback golden server. Nothing is persisted.
export const fogStudy = {
    variant: 'current',
    lightMode: 'season',
    updateCount: 0,
    updateMs: 0,
    bind(audit) {
        this.audit = audit;
        audit.fogStudy = this;
        this.nativeUpdate = audit.references.lighting.update.bind(audit.references.lighting);
        const lighting = audit.references.lighting;
        const { renderer, discoveryFog } = audit.references;
        const nativeShadow = renderer.shadowMap.render.bind(renderer.shadowMap);
        renderer.shadowMap.render = (...args) => {
            const calls = renderer.info.render.calls;
            const triangles = renderer.info.render.triangles;
            nativeShadow(...args);
            this.shadow = { calls: renderer.info.render.calls - calls,
                triangles: renderer.info.render.triangles - triangles };
        };
        if (discoveryFog) {
            const nativeKnowledge = discoveryFog.setKnowledge.bind(discoveryFog);
            discoveryFog.setKnowledge = view => {
                const texture = discoveryFog.root.children.at(-1)?.material.alphaMap;
                const started = performance.now();
                nativeKnowledge(view);
                const generated = texture !== discoveryFog.root.children.at(-1)?.material.alphaMap;
                if (audit.active) audit.record(generated ? 'fog.maskGeneration' : 'fog.unchangedKnowledge',
                    performance.now() - started);
            };
            audit.wrap(discoveryFog, 'update', 'fog.fadeUpdate');
        }
        lighting.update = (time, progress) => {
            const start = this.measuring || audit.active ? performance.now() : 0;
            if (this.lightMode !== 'season') lighting.visualization = 'day-night';
            this.nativeUpdate(time, this.lightMode === 'night' ? 0 : this.lightMode === 'dusk' ? .18 : progress);
            this.apply();
            if (this.measuring) {
                this.updateMs += performance.now() - start;
                this.updateCount++;
            }
            if (audit.active) audit.record('fog.lightingUpdate', performance.now() - start);
        };
        this.configure();
    },
    configure({ variant = this.variant, lightMode = this.lightMode } = {}) {
        if (!['current', 'atmospheric-only', 'candidate', 'shroud-only'].includes(variant)) throw Error('Unknown fog study variant.');
        if (!['season', 'dusk', 'night'].includes(lightMode)) throw Error('Unknown fog study lighting.');
        this.variant = variant;
        this.lightMode = lightMode;
        const { campaign, lighting } = this.audit.references;
        const projection = campaign.readProjection();
        this.projection = projection;
        const night = lightMode === 'night' ? 1 : lightMode === 'dusk' ?
            1 - MathUtils.smoothstep(daylight(.18), .12, .65) : 0;
        const candidate = variant === 'candidate' || variant === 'shroud-only';
        this.ranges = fjordFogPresentation(candidate ? 'nordic' : 'current', { width: campaign.blueprint.config.width,
            winterWeight: projection.calendar.winterWeight, rainWeight: projection.precipitation.rain,
            weather: projection.weatherVisual.class, nightWeight: night });
        lighting.setFogPresentation(this.ranges);
        this.audit.references.discoveryFog?.setPresentation(this.ranges);
        if (lightMode === 'season') lighting.setSeason(projection.calendar.visualProgress, projection.weatherVisual.lighting);
        else lighting.setVisualization('day-night');
        lighting.setFog(variant !== 'shroud-only');
        this.apply();
    },
    apply() {
        const { discoveryFog } = this.audit.references;
        if (!discoveryFog) return;
        discoveryFog.root.visible = this.variant !== 'atmospheric-only';
    },
    inspect() {
        const { lighting, discoveryFog, scene, renderer, rivalScene } = this.audit.references;
        return { variant: this.variant, lightMode: this.lightMode, rangesBeforeCameraOffset: this.ranges,
            fog: { near: lighting.fog.near, far: lighting.fog.far, color: lighting.fog.color.getHexString(), active: !!scene.fog },
            discovery: discoveryFog?.inspect() ?? null,
            shroud: discoveryFog?.root.children.map(mesh => ({ color: mesh.material.color.getHexString(),
                fog: mesh.material.fog, opacity: mesh.material.opacity, alphaTest: mesh.material.alphaTest,
                width: mesh.material.alphaMap.image.width, height: mesh.material.alphaMap.image.height })) ?? [],
            rivals: rivalScene?.describe() ?? [], programs: renderer.info.programs?.length ?? 0,
            shadow: this.shadow,
            main: { calls: renderer.info.render.calls - (this.shadow?.calls ?? 0),
                triangles: renderer.info.render.triangles - (this.shadow?.triangles ?? 0) },
            structureSnow: JSON.parse(document.querySelector('#fjord-canvas').dataset.structureSnow || 'null'),
            terrainSnow: JSON.parse(document.querySelector('#fjord-canvas').dataset.seasonMaterials || 'null') };
    },
};
