import { BufferGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, SkinnedMesh } from 'three';
import { CharacterAppearance } from '../characters/CharacterAppearance';

/** Small faceted modules in model axes, centred on the rigid head. */
export function appearanceModules(profile:CharacterAppearance,size:Vector3,lod:number){
    const group=new Group();group.name='Appearance';group.userData.appearance=profile;
    const material=new MeshStandardMaterial({color:profile.color,roughness:1,flatShading:true});
    const bandMaterial=new MeshStandardMaterial({color:'#8b7047',roughness:1,flatShading:true});
    const rx=size.x/2+.008,ry=size.y/2+.008,rz=size.z/2+.008;
    const add=(geometry:BufferGeometry,name:string,position=new Vector3(),scale=new Vector3(1,1,1),band=false)=>{
        const mesh=new Mesh(geometry,band?bandMaterial:material);mesh.name=name;mesh.position.copy(position);mesh.scale.copy(scale);mesh.castShadow=true;group.add(mesh);return mesh;
    };
    const segments=[12,10,8][lod],rows=[4,3,3][lod],vertices:number[]=[],indices:number[]=[];
    for(let r=0;r<=rows;r++)for(let i=0;i<=segments;i++){
        const theta=i/segments*Math.PI*2,front=Math.max(0,Math.cos(theta));
        const phi=r/rows*(Math.PI*(.73-front*.32));
        const ridge=1+.035*Math.sin(theta*3+r*1.7);
        vertices.push(Math.sin(theta)*Math.sin(phi)*rx*ridge,Math.cos(phi)*ry*ridge,Math.cos(theta)*Math.sin(phi)*rz*ridge);
        if(r<rows&&i<segments){const a=r*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    const cap=new BufferGeometry();cap.setAttribute('position',new Float32BufferAttribute(vertices,3));cap.setIndex(indices);cap.computeVertexNormals();add(cap,'HairCap');
    const blob=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>add(new IcosahedronGeometry(1,0),name,new Vector3(x*rx,y*ry,z*rz),new Vector3(sx*rx,sy*ry,sz*rz));
    const chain=(name:string,x:number,y:number,z:number,length:number,width:number)=>{
        const count=[5,4,3][lod];
        for(let i=0;i<count;i++){const t=i/(count-1);blob(name,x+Math.sin(i*2)*.08,y-length*t,z,width*(1-t*.55),length/count*.8,width*(1-t*.55));}
        add(new IcosahedronGeometry(1,0),name+'Tie',new Vector3(x*rx,(y-length+.08)*ry,z*rz),new Vector3(width*rx*.65,ry*.10,width*rz*.65),true);
    };
    switch(profile.hairStyle){
        case 'medium':for(const side of [-1,1])blob('HairMedium',side*.8,-.32,-.15,.38,.75,.75);blob('HairBack',0,-.3,-.75,.85,.75,.4);break;
        case 'long':for(const side of [-1,1])blob('HairLong',side*.83,-.7,-.25,.36,1.35,.65);blob('HairBack',0,-.65,-.85,.85,1.4,.32);break;
        case 'tied':blob('HairTie',0,-.10,-1.02,.35,.35,.35);blob('HairTail',0,-.8,-1.1,.38,1.2,.35);break;
        case 'bun':blob('HairBun',0,1.1,-.55,.55,.6,.55);break;
        case 'braid':chain('HairBraid',.85,-.5,-.45,1.8,.4);break;
        case 'short':blob('HairCrest',-.12,.85,.18,.85,.35,.7);break;
    }
    if(profile.beardStyle!=='none'){
        // Chin/jaw frame leaves the central upper face clear.
        for(const side of [-1,1])blob('BeardJaw',side*.65,-.63,.67,.28,.50,.28);
        blob('Moustache',0,-.48,.91,.62,.13,.15);
        const style=profile.beardStyle;
        if(style==='stubble')blob('BeardChin',0,-.9,.70,.62,.24,.3);
        else if(style==='braid')chain('BeardBraid',0,-.95,.86,1.5,.42);
        else if(style==='split-braid')for(const side of [-1,1])chain('BeardBraid',side*.4,-.95,.78,1.2,.3);
        else {const length=style==='short'?.45:style==='medium'?.8:1.6;blob('BeardVolume',0,-.95-length*.35,.75,.78,length,.42);}
    }
    return group;
}

/** A simple waist wrap proves a separate garment can share skinning and morphs. */
export function clothingLayer(body:SkinnedMesh){
    const source=body.geometry,position=source.attributes.position,index=source.index;
    if(!index||!source.attributes.skinIndex)return null;
    const triangles:number[]=[];
    for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        if(ids.every(v=>position.getY(v)>.83&&position.getY(v)<1.04&&Math.abs(position.getX(v))<.30))triangles.push(...ids);
    }
    if(!triangles.length)return null;
    const geometry=source.clone();geometry.setIndex(triangles);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){p.setX(i,p.getX(i)*1.035);p.setZ(i,p.getZ(i)*1.035);}
    const garment=new SkinnedMesh(geometry,new MeshStandardMaterial({color:'#71634e',roughness:1,flatShading:true}));
    garment.name='ClothingWaistWrap';garment.bind(body.skeleton,body.bindMatrix);garment.morphTargetInfluences=body.morphTargetInfluences?.slice();garment.morphTargetDictionary=body.morphTargetDictionary;
    garment.frustumCulled=false;garment.castShadow=true;return garment;
}

export function disposeModules(group:Group){
    const materials=new Set<MeshStandardMaterial>();
    group.traverse(o=>{if((o as Mesh).isMesh){const mesh=o as Mesh;mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m as MeshStandardMaterial);}});
    for(const material of materials)material.dispose();group.removeFromParent();
}
