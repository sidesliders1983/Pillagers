/** GLTFExporter emits a skin record per mesh even when they share one rig.
 * Coalesce identical joint/inverse-bind records; all geometry stays unchanged.
 */
export function deduplicateSharedSkins(data:ArrayBuffer):ArrayBuffer {
    const header=new DataView(data),jsonLength=header.getUint32(12,true);
    const document=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,jsonLength)));
    if((document.skins?.length??0)<2)return data;
    const binStart=20+jsonLength+8,unique:typeof document.skins=[],keys=new Map<string,number>(),remap:number[]=[];
    for(const skin of document.skins){
        const accessor=document.accessors[skin.inverseBindMatrices],view=document.bufferViews[accessor.bufferView];
        const offset=binStart+(view.byteOffset??0)+(accessor.byteOffset??0),values:number[]=[];
        for(let matrix=0;matrix<accessor.count;matrix++)for(let c=0;c<16;c++)values.push(header.getFloat32(offset+matrix*(view.byteStride??64)+c*4,true));
        const key=JSON.stringify([skin.joints,skin.skeleton,values]);let index=keys.get(key);
        if(index===undefined){const slot:number=unique.length;keys.set(key,slot);unique.push(skin);remap.push(slot);}else remap.push(index);
    }
    if(unique.length===document.skins.length)return data;
    for(const node of document.nodes)if(node.skin!==undefined)node.skin=remap[node.skin];document.skins=unique;
    const encoded=new TextEncoder().encode(JSON.stringify(document)),paddedLength=Math.ceil(encoded.length/4)*4;
    const oldBinary=new Uint8Array(data,20+jsonLength),result=new ArrayBuffer(20+paddedLength+oldBinary.length),bytes=new Uint8Array(result),output=new DataView(result);
    bytes.set(new Uint8Array(data,0,12));output.setUint32(8,result.byteLength,true);output.setUint32(12,paddedLength,true);output.setUint32(16,0x4e4f534a,true);
    bytes.fill(32,20,20+paddedLength);bytes.set(encoded,20);bytes.set(oldBinary,20+paddedLength);return result;
}
