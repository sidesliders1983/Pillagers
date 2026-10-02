import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const cache=new Map();
/** Read real rig/geometry without a browser image decoder. Never changes files. */
export function geometryAsset(path){
    if(cache.has(path))return cache.get(path);
    const bytes=readFileSync(new URL(`../public/${path}`,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
    delete json.images;delete json.textures;delete json.materials;delete json.samplers;delete json.extensionsUsed;delete json.extensionsRequired;
    for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
    const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32),binary=bytes.subarray(20+length),header=Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+padding.length+binary.length,8);header.writeUInt32LE(text.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const data=Buffer.concat([header,text,padding,binary]),pending=new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');cache.set(path,pending);return pending;
}
