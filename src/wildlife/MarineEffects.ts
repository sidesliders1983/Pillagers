import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
    Points, PointsMaterial, RingGeometry } from 'three';

/** Fixed, tiny pools: one wake ring, one splash ring and 32 overlapping soft mist puffs. */
export class MarineEffects {
    readonly root = new Group();
    private readonly wakeMaterial = new MeshBasicMaterial({ color: '#dceef0', transparent: true,
        opacity: 0, depthWrite: false });
    private readonly splashMaterial = this.wakeMaterial.clone();
    private readonly ring = new RingGeometry(.93, 1, 32);
    private readonly wake = new Mesh(this.ring, this.wakeMaterial);
    private readonly splash = new Mesh(this.ring, this.splashMaterial);
    private readonly droplets = new BufferGeometry();
    private readonly mist = new PointsMaterial({ color: '#eaf3f4', size: 1, transparent: true,
        opacity: 0, depthWrite: false, sizeAttenuation: true });
    private readonly spout: Points;
    constructor(private readonly length: number) {
        this.mist.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_particle_fragment>',
                '#include <map_particle_fragment>\n' +
                'float mistRadius = length(gl_PointCoord - vec2(0.5)) * 2.0;\n' +
                'diffuseColor.a *= 1.0 - smoothstep(0.15, 1.0, mistRadius);');
        };
        const positions: number[] = [];
        for (let index = 0; index < 32; index++) positions.push(0, 0, 0);
        this.droplets.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this.spout = new Points(this.droplets, this.mist);
        this.spout.frustumCulled = false;
        this.wake.rotation.x = this.splash.rotation.x = -Math.PI / 2;
        this.spout.position.z = length * .285;
        this.splash.position.z = -length * .36;
        this.root.add(this.wake, this.splash, this.spout);
    }
    update(x: number, y: number, z: number, heading: number,
        pose: { wake: number; spout: number; blowAge: number; splash: number }, time: number) {
        this.root.position.set(x, y + .035, z);
        this.root.rotation.y = heading;
        this.wake.scale.set(this.length * .17 + Math.sin(time * 2) * .1, this.length * .36, 1);
        this.wakeMaterial.opacity = pose.wake * .12;
        this.splash.scale.setScalar(1 + pose.splash * 3);
        this.splashMaterial.opacity = pose.splash * .65;
        this.mist.opacity = pose.spout * .18;
        if (pose.spout > .01) {
            const positions = this.droplets.getAttribute('position');
            const age = pose.blowAge;
            for (let index = 0; index < positions.count; index++) {
                const fraction = index / (positions.count - 1), angle = index * 2.4;
                const spread = (.08 + age * .9) * Math.sqrt(fraction);
                positions.setXYZ(index, Math.cos(angle) * spread + age * .45,
                    .2 + age * (1.6 + fraction * 2), Math.sin(angle) * spread - age * .3);
            }
            positions.needsUpdate = true;
            // The tiny pool moves upward and expands; it is a short cloud, not a water jet.
            this.mist.size = .45 + age * 1.1;
        }
        this.wake.visible = pose.wake > .01;
        this.splash.visible = pose.splash > .01;
        this.spout.visible = pose.spout > .01;
    }
    dispose() {
        this.root.removeFromParent();
        this.ring.dispose();
        this.droplets.dispose();
        this.wakeMaterial.dispose();
        this.splashMaterial.dispose();
        this.mist.dispose();
    }
}
