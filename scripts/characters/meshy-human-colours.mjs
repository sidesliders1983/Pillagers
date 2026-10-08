import {garmentFaces} from './meshy-human-garment-segmentation.mjs';
// Facet colours are assigned in the unchanged source pose, before LOD reduction.
// Splitting only colour-boundary vertices prevents white/skin interpolation.
export function colourMeshyHuman(document){
 const buffer=document.getRoot().listBuffers()[0];
 const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 const skin=[.76,.52,.36].map(linear),white=[.96,.95,.92].map(linear);
 const material=document.createMaterial('White clothing and warm skin').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(1).setMetallicFactor(0);
 for(const node of document.getRoot().listNodes()){
  const mesh=node.getMesh(),joints=node.getSkin()?.listJoints();if(!mesh||!joints)continue;
  for(const primitive of mesh.listPrimitives()){
   const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray();
   const attrs=primitive.listSemantics().filter(s=>s!=='COLOR_0').map(semantic=>({semantic,accessor:primitive.getAttribute(semantic),values:[]}));
   const remap=new Map(),newIndices=[],colours=[],labels=garmentFaces(primitive,joints);
   for(let i=0;i<indices.length;i+=3){
    const face=[indices[i],indices[i+1],indices[i+2]],clothing=!!labels[i/3],palette=clothing?white:skin;
    for(const vertex of face){
     const key=vertex+':'+Number(clothing);let index=remap.get(key);
     if(index===undefined){
      index=remap.size;remap.set(key,index);colours.push(...palette);
      for(const attr of attrs){const array=attr.accessor.getArray(),size=attr.accessor.getElementSize();for(let k=0;k<size;k++)attr.values.push(array[vertex*size+k]);}
     }
     newIndices.push(index);
    }
   }
   for(const attr of attrs){
    const replacement=document.createAccessor(attr.semantic+' coloured',buffer).setType(attr.accessor.getType()).setNormalized(attr.accessor.getNormalized()).setArray(new (attr.accessor.getArray().constructor)(attr.values));
    primitive.setAttribute(attr.semantic,replacement);
   }
   primitive.setIndices(document.createAccessor('Colour boundary indices',buffer).setType('SCALAR').setArray(new Uint16Array(newIndices)));
   primitive.setAttribute('COLOR_0',document.createAccessor('Clothing and skin colours',buffer).setType('VEC3').setArray(new Float32Array(colours)));
   primitive.setMaterial(material);
  }
 }
}

