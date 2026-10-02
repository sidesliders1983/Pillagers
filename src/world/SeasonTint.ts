import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { seasonBlend } from '../config/timeVisualization';
/** Only material uniforms change during the cycle; geometry and instancing stay intact. */
export class SeasonTint {
    private materials=new Map<MeshStandardMaterial,Color>();
    private ground:MeshStandardMaterial;
    private groundBase:Color;
    private tint=new Color();
    private next=new Color();
    private snow=new Map<MeshStandardMaterial,{value:number}>();
    private snowTone=new Color('#edf2f3');
    constructor(root:Group,terrain:Mesh){
        this.ground=terrain.material as MeshStandardMaterial;this.groundBase=this.ground.color.clone();
        this.addSnow(this.ground,false);
        const clones=new Map<MeshStandardMaterial,MeshStandardMaterial>();
        root.traverse(node=>{if(!(node instanceof Mesh)||!node.userData.seasonalFoliage)return;
            const copy=(source:MeshStandardMaterial)=>{let material=clones.get(source);if(!material){material=source.clone();clones.set(source,material);this.materials.set(material,source.color.clone());this.addSnow(material,true);}return material;};
            node.material=Array.isArray(node.material)?node.material.map(m=>copy(m as MeshStandardMaterial)):copy(node.material as MeshStandardMaterial);
        });
    }
    private addSnow(material:MeshStandardMaterial,foliage:boolean){
        const amount={value:0};this.snow.set(material,amount);
        material.onBeforeCompile=shader=>{
            shader.uniforms.seasonSnowAmount=amount;shader.uniforms.seasonSnowTone={value:this.snowTone};
            shader.fragmentShader='uniform float seasonSnowAmount; uniform vec3 seasonSnowTone;\n'+shader.fragmentShader;
            const mask=foliage?'\n#ifdef USE_COLOR\nseasonMask=smoothstep(1.0,1.2,vColor.g/max(max(vColor.r,vColor.b),0.001));\n#endif\n':'';
            shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat seasonMask=1.0;${mask}\ndiffuseColor.rgb=mix(diffuseColor.rgb,seasonSnowTone,seasonSnowAmount*seasonMask);`);
        };
        material.customProgramCacheKey=()=>foliage?'season-foliage-v1':'season-ground-v1';
    }
    update(progress:number|null){
        if(progress===null){this.ground.color.copy(this.groundBase);for(const [material,base] of this.materials)material.color.copy(base);for(const amount of this.snow.values())amount.value=0;return;}
        const {from,to,mix}=seasonBlend(progress);
        const winter=from.name==='Winter'?1-mix:to.name==='Winter'?mix:0;
        for(const amount of this.snow.values())amount.value=winter*.65;
        this.tint.setHex(from.ground).lerp(this.next.setHex(to.ground),mix);
        this.ground.color.copy(this.groundBase).multiply(this.tint);
        this.tint.setHex(from.foliage).lerp(this.next.setHex(to.foliage),mix);
        for(const [material,base] of this.materials)material.color.copy(base).multiply(this.tint);
    }
    dispose(){for(const material of this.materials.keys())material.dispose();}
}
