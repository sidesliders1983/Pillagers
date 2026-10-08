import type {CharacterAsset} from './CharacterAssets';
import {meshyModuleFiles} from './MeshyModuleMeasurements';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
/** These four proofs are explicit Lab previews until the user approves their exact artwork. */
export const meshyCharacterModules:readonly CharacterAsset[]=meshyModuleFiles.map(file=>{
 const type=file.id.split('/')[0] as 'hair'|'beard'|'garment'|'equipment',label={hair:'Short angular hair',beard:'Compact wedge beard',outfit:'Tunic, trousers and boots · outfit preview',pouch:'Belt pouch'}[file.name];
 return {id:file.id,type,version:1,scope:'body-bound',reviewStatus:'preview',label,style:type==='hair'||type==='beard'?'short':file.name,
 compatibleBodies:meshyHumanAssetIdentity.map(source=>({id:'body/meshy-human',sha256:source.sha256})),
 lods:{2:file.path},runtimeLOD:2,materialVariants:[type==='hair'||type==='beard'?'profile-hair-colour':'authored-linear-palette'],tags:['authored-template','native-meshy-rig','proof-v2'],
 budgets:{triangles:{2:file.triangles},materials:1,runtimeTriangles:file.triangles},
 metadata:{version:'pillagers-fit/0.2',id:file.id,type,anchor:type==='hair'?'socket_head_top':type==='beard'?'socket_jaw':type==='garment'?'socket_chest':'socket_waist',fitMode:type==='garment'?'drape':type==='equipment'?'rigid':'conform',authoringFrame:'meshy-native',nativeBinding:file.binding,clearance:type==='garment'?.016:.007,
 ...(type==='garment'?{slot:'full' as const}:{}),...(type==='equipment'?{accessorySlot:'belt' as const,dependency:{module:'garment/meshy-tunic-trousers',frame:'belt_side_L'}}:{})}};
});
