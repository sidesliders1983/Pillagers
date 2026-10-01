import { Mesh, MeshStandardMaterial } from 'three';
// Partition existing triangles; no overlaid coplanar geometry or asset mutation on disk.
export function splitEmissiveSurfaces(mesh:Mesh, matches:(vertex:number)=>boolean):MeshStandardMaterial|null {
    if(Array.isArray(mesh.material)||!(mesh.material as MeshStandardMaterial).isMeshStandardMaterial)return null;
    const geometry=mesh.geometry,source=geometry.index,vertices=geometry.getAttribute('position');
    const plain:number[]=[],glowing:number[]=[];
    for(let i=0;i<(source?.count??vertices.count);i+=3){
        const a=source?source.getX(i):i,b=source?source.getX(i+1):i+1,c=source?source.getX(i+2):i+2;
        (matches(a)&&matches(b)&&matches(c)?glowing:plain).push(a,b,c);
    }
    if(!glowing.length)return null;
    const glow=(mesh.material as MeshStandardMaterial).clone();
    geometry.setIndex(plain.concat(glowing));geometry.clearGroups();
    if(plain.length)geometry.addGroup(0,plain.length,0);geometry.addGroup(plain.length,glowing.length,1);
    mesh.material=[mesh.material,glow];return glow;
}
