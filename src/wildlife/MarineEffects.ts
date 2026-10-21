import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
    Points, PointsMaterial, RingGeometry } from 'three';

/** Fixed, tiny pools: one wake ring, one splash ring and 24 blow droplets per visitor. */
export class MarineEffects {
    readonly root = new Group();
    private readonly wakeMaterial = new MeshBasicMaterial({ color: '#dceef0', transparent: true,
        opacity: 0, depthWrite: false });
    private readonly splashMaterial = this.wakeMaterial.clone();
    private readonly ring = new RingGeometry(.85, 1, 24);
    private readonly wake = new Mesh(this.ring, this.wakeMaterial);
    private readonly splash = new Mesh(this.ring, this.splashMaterial);
    private readonly droplets = new BufferGeometry();
    private readonly mist = new PointsMaterial({ color: '#eefaff', size: .45, transparent: true,
        opacity: 0, depthWrite: false, sizeAttenuation: true });
    private readonly spout: Points;
    constructor() {
        this.mist.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_particle_fragment>',
                '#include <map_particle_fragment>\n' +
                'float mistRadius = length(gl_PointCoord - vec2(0.5)) * 2.0;\n' +
                'diffuseColor.a *= 1.0 - smoothstep(0.15, 1.0, mistRadius);');
        };
        const positions: number[] = [];
        for (let index = 0; index < 24; index++) {
            const t = index / 23, angle = index * 2.4;
            positions.push(Math.cos(angle) * t * .7, t * 3.5, Math.sin(angle) * t * .7);
        }
        this.droplets.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this.spout = new Points(this.droplets, this.mist);
        this.wake.rotation.x = this.splash.rotation.x = -Math.PI / 2;
        this.spout.position.z = 4;
        this.splash.position.z = -5;
        this.root.add(this.wake, this.splash, this.spout);
    }
    update(x: number, y: number, z: number, heading: number,
        pose: { wake: number; spout: number; splash: number }, time: number) {
        this.root.position.set(x, y + .035, z);
        this.root.rotation.y = heading;
        this.wake.scale.set(2.4 + Math.sin(time * 2) * .1, 5, 1);
        this.wakeMaterial.opacity = pose.wake * .24;
        this.splash.scale.setScalar(1 + pose.splash * 3);
        this.splashMaterial.opacity = pose.splash * .65;
        this.mist.opacity = pose.spout * .9;
        this.spout.scale.setScalar(.5 + pose.spout * .7);
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
