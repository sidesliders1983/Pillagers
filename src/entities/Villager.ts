import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, IcosahedronGeometry, Object3D } from 'three';
const body = new CylinderGeometry(.23, .3, .65, 6), head = new IcosahedronGeometry(.18, 0), leg = new CylinderGeometry(.085, .07, .38, 5);
const skin = new MeshStandardMaterial({ color: 0xe1bd99, roughness: 1 }), boots = new MeshStandardMaterial({ color: 0x544c43, roughness: 1 });
const coats = [0x927469, 0x75848b, 0xb4a16e, 0x7b8a72].map(color => new MeshStandardMaterial({ color, roughness: 1 }));
export class Villager {
    readonly visual: Object3D;
    readonly target = { x: 0, z: 0 };
    phase: number;
    wait = 0;
    speed = 0;
    constructor(readonly id: number, visual?: Object3D) {
        this.phase = id;
        if (visual) {
            this.visual = visual;
            return;
        }
        const group = new Group();
        const torso = new Mesh(body, coats[id % coats.length]);
        torso.position.y = .7;
        const face = new Mesh(head, skin);
        face.position.y = 1.18;
        group.add(torso, face);
        for (const x of [-.13, .13]) {
            const foot = new Mesh(leg, boots);
            foot.position.set(x, .22, 0);
            group.add(foot);
        }
        group.traverse(node => {
            if (node instanceof Mesh)
                node.castShadow = true;
        });
        this.visual = group;
    }
}
