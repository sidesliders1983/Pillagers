import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export const publicRoot=new URL('../../public/',import.meta.url);
export function publicFile(path){if(!/^\/[\w/.-]+\.(glb|json)$/.test(path)||path.includes('..'))throw new Error(`Invalid public asset path: ${path}`);return new URL(path.slice(1),publicRoot);}
export function readGLB(path){
    const bytes=readFileSync(publicFile(path));
    if(bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('invalid GLB v2 header/length');
    let offset=12,json,binary;
    while(offset<bytes.length){
        if(offset+8>bytes.length)throw new Error('truncated GLB chunk');
        const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
        if(length%4||offset+length>bytes.length)throw new Error('invalid GLB chunk length');
        if(type===0x4e4f534a){if(json||offset!==20)throw new Error('invalid GLB JSON chunk');json=JSON.parse(bytes.subarray(offset,offset+length).toString());}
        else if(type===0x004e4942){if(binary)throw new Error('duplicate GLB BIN chunk');binary=bytes.subarray(offset,offset+length);}
        else throw new Error('unexpected GLB chunk');
        offset+=length;
    }
    if(json?.asset?.version!=='2.0'||!binary)throw new Error('missing glTF 2.0 JSON/BIN');
    return {bytes,json,binary,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function accessorValues(json,binary,index){
    const a=json.accessors?.[index];if(!a)throw new Error(`missing accessor ${index}`);
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
    const types={5120:[1,'readInt8',127],5121:[1,'readUInt8',255],5122:[2,'readInt16LE',32767],5123:[2,'readUInt16LE',65535],5125:[4,'readUInt32LE',4294967295],5126:[4,'readFloatLE',1]};
    if(!width||!types[a.componentType]||!Number.isInteger(a.count)||a.count<=0)throw new Error(`invalid accessor ${index}`);
    function rows(viewIndex,offset,type,count,columns){
        const view=json.bufferViews?.[viewIndex],entry=types[type];if(!view||!entry)throw new Error(`accessor ${index}: missing/invalid bufferView`);
        const [size,reader]=entry,base=(view.byteOffset??0)+(offset??0),stride=view.byteStride??size*columns;
        if(view.buffer!==0||stride<size*columns||base<0||base+(count-1)*stride+size*columns>(view.byteOffset??0)+view.byteLength||base+(count-1)*stride+size*columns>binary.length)throw new Error(`accessor ${index}: buffer range exceeds BIN/view`);
        return Array.from({length:count},(_,i)=>Array.from({length:columns},(_,j)=>binary[reader](base+i*stride+j*size)));
    }
    const values=a.bufferView===undefined?Array.from({length:a.count},()=>Array(width).fill(0)):rows(a.bufferView,a.byteOffset,a.componentType,a.count,width);
    if(a.sparse){const s=a.sparse,indices=rows(s.indices.bufferView,s.indices.byteOffset,s.indices.componentType,s.count,1),replacement=rows(s.values.bufferView,s.values.byteOffset,a.componentType,s.count,width);indices.forEach(([i],j)=>{if(i>=a.count)throw new Error(`accessor ${index}: sparse index out of range`);values[i]=replacement[j];});}
    if(values.some(row=>row.some(value=>!Number.isFinite(value))))throw new Error(`accessor ${index}: non-finite values`);
    return a.normalized?values.map(row=>row.map(value=>Math.max(-1,value/types[a.componentType][2]))):values;
}
/** Node checks rig/geometry; embedded textures are checked structurally, decoded in browser review. */
export async function geometryGLTF(record){
    const json=structuredClone(record.json);
    delete json.images;delete json.textures;delete json.materials;delete json.samplers;
    delete json.extensionsUsed;delete json.extensionsRequired;
    for(const mesh of json.meshes??[])for(const primitive of mesh.primitives)delete primitive.material;
    const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32),binHeader=Buffer.alloc(8),header=Buffer.alloc(20);
    binHeader.writeUInt32LE(record.binary.length);binHeader.writeUInt32LE(0x004e4942,4);
    header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+padding.length+record.binary.length,8);header.writeUInt32LE(text.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const data=Buffer.concat([header,text,padding,binHeader,record.binary]);
    return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
}
export function measureGLB(record,gltf){
    let triangles=0;gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{if(object.isMesh)triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;});
    const box=new Box3().setFromObject(gltf.scene,true),min=box.min.toArray(),max=box.max.toArray();
    if(!Number.isInteger(triangles)||triangles<=0||[...min,...max].some(v=>!Number.isFinite(v)))throw new Error('invalid geometry/bounds');
    return {sha256:record.sha256,triangles,materials:record.json.materials?.length??0,bytes:record.bytes.length,bounds:{min,max}};
}
