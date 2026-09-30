import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, SphereGeometry, BoxGeometry, BufferGeometry, Float32BufferAttribute } from 'three';
import { Phenotype } from '../characters/Phenotype';

// Rendering consumes a phenotype only; no DNA/heritage/occupation decisions live here.
export class Mannequin {
    readonly root = new Group();
    private body = new Group();
    private arms: Group[] = [];
    private geometries: BufferGeometry[] = [new CylinderGeometry(.5,.43,1,6), new SphereGeometry(.5,8,5), new BoxGeometry(1,1,1)];
    private materials: MeshStandardMaterial[];
    constructor(private phenotype: Phenotype) {
        const p=phenotype;
        const skin=new MeshStandardMaterial({color:p.skinTone,flatShading:true,roughness:1});
        const linen=new MeshStandardMaterial({color:0x9aa79f,flatShading:true,roughness:1});
        const trousers=new MeshStandardMaterial({color:0x77756d,flatShading:true,roughness:1});
        const hair=new MeshStandardMaterial({color:p.hairColor,flatShading:true,roughness:1});
        const eyes=new MeshStandardMaterial({color:p.eyeColor,roughness:1});
        this.materials=[skin,linen,trousers,hair,eyes];
        const add=(parent:Group,geometry:BufferGeometry,material:MeshStandardMaterial,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
            const mesh=new Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
        };
        const [cylinder,sphere,box]=this.geometries;
        const hipY=p.height*p.legRatio,headY=p.height-p.headHeight*.5;
        const shoulderY=p.height-p.headHeight-.035;
        const torsoHeight=shoulderY-hipY;
        this.body.position.y=hipY;this.root.add(this.body);
        add(this.body,cylinder,linen,0,torsoHeight*.5,0,p.shoulderWidth,torsoHeight,p.torsoDepth);
        add(this.body,sphere,trousers,0,0,0,p.hipWidth,.22*p.height,p.torsoDepth*.95);
        add(this.body,cylinder,skin,0,shoulderY-hipY+.025,0,p.headWidth*.48,.08,p.headWidth*.48);
        const head=new Group();head.position.set(p.asymmetry,headY-hipY,0);this.body.add(head);
        add(head,sphere,skin,0,0,0,p.headWidth,p.headHeight,p.headWidth*.92);
        add(head,sphere,skin,0,-p.headHeight*.25,p.headWidth*.035,p.jawWidth,p.headHeight*.42,p.headWidth*.8);
        for(const side of [-1,1]){
            add(head,sphere,skin,side*(p.headWidth*.49),-.006,-.012,p.earSize,p.earSize*1.65,p.earSize*.8);
            add(head,sphere,eyes,side*p.eyeSpacing*.5,p.headHeight*.05,p.headWidth*.415,.013,.015,.009);
            add(head,sphere,skin,side*p.headWidth*.31,(p.cheekboneHeight-.58)*p.headHeight,p.headWidth*.32,.042,.028,.023);
        }
        const nose=new BufferGeometry();
        const w=.014,h=p.headHeight*.22,l=p.noseLength;
        nose.setAttribute('position',new Float32BufferAttribute([-w,-h/2,0,w,-h/2,0,0,-h/2,l, -w,-h/2,0,0,-h/2,l,0,h/2,0, w,-h/2,0,0,h/2,0,0,-h/2,l, -w,-h/2,0,0,h/2,0,w,-h/2,0],3));nose.computeVertexNormals();this.geometries.push(nose);
        add(head,nose,skin,p.asymmetry,0,p.headWidth*.42,1,1,1);
        const cap=new SphereGeometry(.5,8,4,0,Math.PI*2,0,Math.PI*.58);this.geometries.push(cap);
        add(head,cap,hair,0,p.headHeight*.14-p.hairline*.025,-.012,p.headWidth*1.06,p.headHeight*.88,p.headWidth*1.01);
        if(p.beardCoverage>0){
            add(head,cylinder,hair,0,-p.headHeight*.34,p.headWidth*.19,p.jawWidth*.9,p.headHeight*(.25+p.beardCoverage*.28),p.headWidth*.45);
        }
        const armLength=p.height*p.armRatio;
        for(const side of [-1,1]){
            const arm=new Group();arm.position.set(side*p.shoulderWidth*.55,shoulderY-hipY-.03,0);this.body.add(arm);this.arms.push(arm);
            add(arm,sphere,linen,0,0,0,p.armThickness*1.1,p.armThickness*1.1,p.armThickness*1.1);
            add(arm,cylinder,linen,0,-armLength*.25,0,p.armThickness,armLength*.5,p.armThickness);
            add(arm,cylinder,skin,0,-armLength*.72,0,p.armThickness*.8,armLength*.43,p.armThickness*.8);
            add(arm,sphere,skin,0,-armLength*.97,.008,p.armThickness*.9,p.armThickness*1.3,p.armThickness*.65);
            const legX=side*p.hipWidth*.28;
            add(this.root,cylinder,trousers,legX,hipY*.54,0,p.legThickness,hipY*.86,p.legThickness);
            add(this.root,box,trousers,legX,.045,.034,p.legThickness*1.15,.09,p.legThickness*1.75);
        }
    }
    update(time:number){
        const p=this.phenotype,breath=Math.sin(time*p.idleCadence);
        this.body.rotation.x=p.postureLean+breath*.008*(1-p.movementWeight);
        this.body.rotation.y=breath*.018*p.poseTension;
        this.arms.forEach((arm,i)=>{arm.rotation.z=(i===0?1:-1)*(.05+p.poseTension*.09+breath*.015);arm.rotation.x=-p.poseTension*.04;});
    }
    dispose(){this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}
