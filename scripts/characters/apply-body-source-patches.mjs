import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Vector3} from 'three';
import {readLocalGLB} from './style-validation.mjs';
import {accessorValues} from './glb-inspection.mjs';

/** Sequential, hash/before-value-guarded source correction. Never changes a live registry.
 * Corrections are authored on the same immutable source; the coordinator alone merges them.
 * Face normals are regenerated for the corresponding source and all existing relative targets.
 */
export function applyBodySourcePatches(input,patches){
    const source=readLocalGLB(input),json=structuredClone(source.json),binary=Buffer.from(source.binary);
    if(json.meshes?.length!==1||json.meshes[0].primitives.length!==1)throw new Error('Expected one body primitive.');
    const primitive=json.meshes[0].primitives[0],names=json.meshes[0].extras?.targetNames;
    if(!Array.isArray(names)||names.length!==primitive.targets?.length)throw new Error('Missing corresponding named morph targets.');
    const base=accessorValues(json,binary,primitive.attributes.POSITION),originalBase=structuredClone(base);
    const deltas=Object.fromEntries(names.map((name,index)=>[name,accessorValues(json,binary,primitive.targets[index].POSITION)]));
    const indices=primitive.indices===undefined?base.map((_,index)=>index):accessorValues(json,binary,primitive.indices).flat();
    const seen=new Set(),changedBase=new Set(),changedTargets=new Map(),patchReceipts=[];
    const checkRow=row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite);
    const applyRow=(pool,index,before,after,key)=>{
        if(!Number.isInteger(index)||index<0||index>=pool.length||!checkRow(before)||!checkRow(after))throw new Error('Invalid source correction record '+key);
        if(seen.has(key))throw new Error('Concurrent/overlapping source correction '+key);
        if(before.some((value,k)=>Math.abs(value-pool[index][k])>1e-8))throw new Error('Stale correction before-value '+key);
        seen.add(key);pool[index]=after.map(Math.fround);
    };
    for(const patch of patches){
        if(patch.inputSHA256!==source.sha256)throw new Error('Source hash differs from patch input.');
        if(patch.indexChanges?.length||patch.skinChanges?.length||patch.boneChanges?.length)throw new Error('Topology/skin/bone changes require a separately reviewed migration.');
        let baseRecords=0,targetRecords=0;
        for(const record of patch.basePositions??[]){
            for(const index of record.renderVertexIds){
                applyRow(base,index,record.before,record.after,'POSITION:'+index);changedBase.add(index);baseRecords++;
            }
        }
        for(const target of patch.targetChanges??[]){
            if(!deltas[target.name])throw new Error('Unknown target '+target.name);
            const changed=changedTargets.get(target.name)??new Set();changedTargets.set(target.name,changed);
            for(const record of target.records){
                applyRow(deltas[target.name],record.renderVertexId,record.before,record.after,target.name+':'+record.renderVertexId);
                changed.add(record.renderVertexId);targetRecords++;
            }
        }
        patchReceipts.push({name:patch.name??patch.assetId??null,baseRecords,targetRecords});
    }
    // Welded colour/normal-split copies remain geometrically coincident in every target.
    const groups=new Map();
    for(let index=0;index<originalBase.length;index++){
        const key=originalBase[index].join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);
    }
    for(const pool of [base,...Object.values(deltas)])for(const copies of groups.values()){
        const first=pool[copies[0]];
        for(const index of copies)if(pool[index].some((v,k)=>Math.abs(v-first[k])>1e-7))throw new Error('Correction opens a split-attribute seam at '+index);
    }
    const normals=positions=>{
        const rows=positions.map(()=>null);
        for(let offset=0;offset<indices.length;offset+=3){
            const ids=indices.slice(offset,offset+3),face=new Vector3(...positions[ids[1]]).sub(new Vector3(...positions[ids[0]])).cross(new Vector3(...positions[ids[2]]).sub(new Vector3(...positions[ids[0]])));
            if(face.lengthSq()<1e-18)throw new Error('Correction collapses triangle '+offset/3);
            face.normalize();const row=face.toArray().map(Math.fround);
            for(const index of ids){if(rows[index]&&rows[index].some((v,k)=>Math.abs(v-row[k])>1e-6))throw new Error('Source normal corner is shared between different planes.');rows[index]=row;}
        }
        if(rows.some(row=>!row))throw new Error('Unused source corner.');
        return rows;
    };
    function writeRows(accessorIndex,rows){
        const accessor=json.accessors[accessorIndex],view=json.bufferViews[accessor.bufferView];
        if(accessor.componentType!==5126||accessor.type!=='VEC3'||accessor.sparse||accessor.count!==rows.length)throw new Error('Unsupported writable source accessor.');
        const offset=(view.byteOffset??0)+(accessor.byteOffset??0),stride=view.byteStride??12;
        rows.forEach((row,index)=>row.forEach((value,k)=>binary.writeFloatLE(value,offset+index*stride+k*4)));
        accessor.min=[0,1,2].map(k=>Math.min(...rows.map(row=>row[k])));
        accessor.max=[0,1,2].map(k=>Math.max(...rows.map(row=>row[k])));
    }
    const baseNormals=normals(base);writeRows(primitive.attributes.POSITION,base);writeRows(primitive.attributes.NORMAL,baseNormals);
    names.forEach((name,index)=>{
        const target=primitive.targets[index],delta=deltas[name],targetNormals=normals(base.map((row,i)=>row.map((value,k)=>value+delta[i][k])));
        writeRows(target.POSITION,delta);
        if(target.NORMAL===undefined)throw new Error('Source target lacks normal correspondence.');
        writeRows(target.NORMAL,targetNormals.map((row,i)=>row.map((value,k)=>Math.fround(value-baseNormals[i][k]))));
    });
    const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
    header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+padding.length+binary.length,8);
    header.writeUInt32LE(text.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
    const bytes=Buffer.concat([header,text,padding,binHeader,binary]);
    return {bytes,receipt:{schemaVersion:1,input,sourceSHA256:source.sha256,outputSHA256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,triangles:indices.length/3,renderVertices:base.length,positionalVertices:groups.size,patches:patchReceipts,changedBaseRecords:changedBase.size,changedTargetRecords:Object.fromEntries([...changedTargets].map(([name,records])=>[name,records.size])),topologySkinBindNodesPaletteClipsUnchanged:true,normalCorrection:'Native per-source-face and per-target-face normals regenerated after sequential corresponding patches; no smooth averaging.',observedAt:new Date().toISOString()}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    const [input,output,...files]=process.argv.slice(2);if(!input||!output||!files.length)throw new Error('Usage: node apply-body-source-patches.mjs input.glb output.glb patch.json [...]');
    const patchSources=files.map(path=>({path,bytes:readFileSync(path)})),patches=patchSources.map(source=>JSON.parse(source.bytes.toString('utf8'))),result=applyBodySourcePatches(input,patches);
    mkdirSync(dirname(output),{recursive:true});writeFileSync(output,result.bytes);writeFileSync(output.replace(/\.glb$/,'.repair.json'),JSON.stringify({...result.receipt,patchFiles:patchSources.map(source=>({path:source.path,sha256:createHash('sha256').update(source.bytes).digest('hex')}))},null,2)+'\n');console.log(JSON.stringify(result.receipt,null,2));
}
