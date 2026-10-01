import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {load} from './load-source.mjs';
const {humanMorphNames}=load('../src/characters/UniversalHumanProfile.ts');
const root=new URL('../public/universal-human/',import.meta.url);
function glb(file){const data=readFileSync(new URL(file,root));assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);const length=data.readUInt32LE(12);return {data,json:JSON.parse(data.subarray(20,20+length).toString()),binary:data.subarray(28+length)};}
function values(json,binary,index){
    const a=json.accessors[index],width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const read=(bufferView,offset,type,count,columns)=>{
        const view=json.bufferViews[bufferView],bytes={5121:1,5123:2,5125:4,5126:4}[type];
        const stride=view.byteStride??columns*bytes,base=(view.byteOffset??0)+(offset??0);
        const reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[type];
        return Array.from({length:count},(_,i)=>Array.from({length:columns},(_,j)=>binary[reader](base+i*stride+j*bytes)));
    };
    const rows=a.bufferView===undefined?Array.from({length:a.count},()=>Array(width).fill(0)):read(a.bufferView,a.byteOffset,a.componentType,a.count,width);
    if(a.sparse){
        const s=a.sparse,indices=read(s.indices.bufferView,s.indices.byteOffset,s.indices.componentType,s.count,1);
        const replacements=read(s.values.bufferView,s.values.byteOffset,a.componentType,s.count,width);
        indices.forEach(([i],j)=>{rows[i]=replacements[j];});
    }
    return a.normalized?rows.map(row=>row.map(v=>v/(a.componentType===5121?255:65535))):rows;
}
test('published image-generated LODs preserve rig, sockets, morphs, weights and in-place clips',()=>{
    const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
    let previous=Infinity,contract;
    for(const entry of manifest.lods){
        const {data,json,binary}=glb(entry.file);
        assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);
        assert.ok(entry.triangles<previous);previous=entry.triangles;
        const names=json.nodes.map(n=>n.name);
        for(const socket of manifest.sockets)assert.ok(names.includes(socket),socket);
        assert.ok(json.skins.length>0);
        const joints=json.skins[0].joints.map(i=>json.nodes[i].name);
        if(contract)assert.deepEqual(joints,contract);else contract=joints;
        assert.ok(joints.includes('Hips')&&joints.includes('Head')&&joints.includes('Toe_L'));
        for(const name of joints)assert.ok(json.nodes.find(n=>n.name===name).extras?.morphTranslations,`joint ${name} has morphology translations`);
        for(const mesh of json.meshes){
            assert.deepEqual(mesh.extras.targetNames,humanMorphNames);
            for(const p of mesh.primitives){
                assert.equal(p.targets.length,humanMorphNames.length);
                const weights=values(json,binary,p.attributes.WEIGHTS_0);
                for(const row of weights)assert.ok(Math.abs(row.reduce((a,b)=>a+b,0)-1)<.002);
                const points=values(json,binary,p.attributes.POSITION),indices=values(json,binary,p.attributes.JOINTS_0);
                // Independent surface landmark: toes of the image-derived mesh
                // must project toward +Z, the same side as belly/breast morphs.
                const feet=points.filter(([x,y])=>Math.abs(x)>.10&&y<.075);
                if(feet.length){
                    const ankles=points.filter(([x,y])=>Math.abs(x)>.10&&y>.13&&y<.22); const ankleZ=ankles.reduce((sum,v)=>sum+v[2],0)/ankles.length; const forward=Math.max(...feet.map(v=>v[2]))-ankleZ,backward=ankleZ-Math.min(...feet.map(v=>v[2]));
                    assert.ok(forward>backward+.04,'source feet and rig/morph forward direction must agree');
                }
                for(let i=0;i<points.length;i++){
                    const [x,y]=points[i];
                    if(Math.abs(x)>.32&&y>.65&&y<.95){
                        const strongest=weights[i].indexOf(Math.max(...weights[i]));
                        assert.match(joints[indices[i][strongest]],/^(UpperArm|LowerArm|Hand)_/, 'low A-pose hands must follow arms, not knees');
                    }
                }
                const position=json.accessors[p.attributes.POSITION];
                for(const target of p.targets)assert.equal(json.accessors[target.POSITION].count,position.count);
                const fat=values(json,binary,p.targets[humanMorphNames.indexOf('Overweight')].POSITION);
                const thin=values(json,binary,p.targets[humanMorphNames.indexOf('Underweight')].POSITION);
                const belly=points.map((v,i)=>({v,i})).filter(({v:[x,y,z]})=>Math.abs(x)<.15&&y>.95&&y<1.12&&z>.03);
                assert.ok(belly.length>0);
                assert.ok(belly.reduce((sum,{i})=>sum+fat[i][2],0)/belly.length>.30,'caricature belly must visibly project forwards');
                assert.ok(belly.reduce((sum,{i})=>sum+fat[i][1],0)/belly.length<-.10,'large belly must hang down');
                assert.ok(belly.reduce((sum,{i})=>sum+thin[i][2],0)/belly.length<0,'underweight must reduce soft torso volume');
                const feminine=values(json,binary,p.targets[humanMorphNames.indexOf('Feminine')].POSITION);
                const breasts=points.map((v,i)=>({v,i})).filter(({v:[x,y,z]})=>Math.abs(x)>.045&&Math.abs(x)<.13&&y>1.25&&y<1.32&&z>.03);
                assert.ok(breasts.length>0);
                assert.ok(breasts.reduce((sum,{i})=>sum+feminine[i][2],0)/breasts.length>.10,'femininity must grow a visible chest');
                const age=values(json,binary,p.targets[humanMorphNames.indexOf('Age')].POSITION);
                const head=points.map((v,i)=>({v,i})).filter(({v})=>v[1]>1.65);
                assert.ok(head.reduce((sum,{i})=>sum+age[i][1],0)/head.length<-.15,'old head must sink');
                assert.ok(head.reduce((sum,{i})=>sum+age[i][2],0)/head.length>.20,'old head must lean forwards');
                for(const joint of joints){
                    const deltas=JSON.parse(json.nodes.find(n=>n.name===joint).extras.morphTranslations);
                    assert.deepEqual(deltas.Overweight,[0,0,0]);assert.deepEqual(deltas.Underweight,[0,0,0]);
                }
                const triangles=values(json,binary,p.indices).flat();
                for(const name of ['Powerful','Slight','Agile','Grounded']){
                    const offsets=values(json,binary,p.targets[humanMorphNames.indexOf(name)].POSITION);
                    for(let edge=0;edge<triangles.length;edge++){
                        const a=triangles[edge],b=triangles[Math.floor(edge/3)*3+(edge+1)%3];
                        const base=Math.hypot(...points[a].map((v,i)=>v-points[b][i]));
                        const changed=Math.hypot(...points[a].map((v,i)=>v+offsets[a][i]-points[b][i]-offsets[b][i]));
                        assert.ok(changed<=base*2.5+.002,`${name} must not create spikes across regional boundaries`);
                    }
                }
            }
        }
        assert.deepEqual(json.animations.map(a=>a.name).sort(),['Idle','Run','Walk']);
        for(const animation of json.animations){
            assert.ok(animation.channels.length>0);
            assert.ok(animation.channels.every(c=>c.target.path==='rotation'));
            const sampler=animation.samplers[animation.channels[0].sampler];
            const times=values(json,binary,sampler.input);assert.ok(times.at(-1)[0]>0);
        }
    }
    assert.ok(manifest.lods[0].triangles>=6000&&manifest.lods[0].triangles<=10000);
});




