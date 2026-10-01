import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {load} from './load-source.mjs';
const {humanMorphNames}=load('../src/characters/UniversalHumanProfile.ts');
const root=new URL('../public/universal-human/',import.meta.url);
function glb(file){const data=readFileSync(new URL(file,root));assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);const length=data.readUInt32LE(12);return {data,json:JSON.parse(data.subarray(20,20+length).toString()),binary:data.subarray(28+length)};}
function values(json,binary,index){
    const a=json.accessors[index],view=json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],stride=view.byteStride??width*bytes,base=(view.byteOffset??0)+(a.byteOffset??0);
    const reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{const v=binary[reader](base+i*stride+j*bytes);return a.normalized?v/(a.componentType===5121?255:65535):v;}));
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
                for(let i=0;i<points.length;i++){
                    const [x,y]=points[i];
                    if(Math.abs(x)>.32&&y>.65&&y<.95){
                        const strongest=weights[i].indexOf(Math.max(...weights[i]));
                        assert.match(joints[indices[i][strongest]],/^(UpperArm|LowerArm|Hand)_/, 'low A-pose hands must follow arms, not knees');
                    }
                }
                const position=json.accessors[p.attributes.POSITION];
                for(const target of p.targets)assert.equal(json.accessors[target.POSITION].count,position.count);
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
