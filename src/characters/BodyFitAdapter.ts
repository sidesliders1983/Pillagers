import type {Group, Skeleton} from 'three';
import type {CoverageZone, SocketName, RigidFrame} from './AttachmentContract';
export const bodyFitVersion='pillagers-fit/0.2' as const;
export interface SurfaceAnchor {triangle:number;barycentric:readonly [number,number,number];offset:readonly [number,number,number];}
export interface BodySurface {positions:readonly number[];indices:readonly number[];regions:readonly CoverageZone[];triangles:number;}
/** Body adapters preserve their native rig, coordinate frame and actual source surface. */
export interface BodyFitAdapter {
 readonly version:typeof bodyFitVersion;
 readonly body:{id:string;sha256:string;lod:number;rigSignature:string};
 readonly nativeSkeleton:Skeleton;
 readonly sockets:ReadonlyMap<SocketName,Group>;
 readonly revision:number;
 surface(state:'source'|'posed'):BodySurface;
 socketFrame(name:SocketName):RigidFrame & {scale:readonly [number,number,number]};
 refit():void;
}
export interface ModuleBindingV2 {
 version:typeof bodyFitVersion;id:string;moduleSha256:string;rigSignature:string;
 recipe:{id:string;version:number;blender:string};
 coordinateFrame:{up:'+Y';front:'+Z';unit:'metre';origin:'Meshy source bind'};
 construction:'bilateral'|'intentional-asymmetry';
 skinning?:'authored-four-native'|'rigid-native-head';reviewScope?:string;
 supportedAges:{min:number;max:number};
 lods:Record<number,{bodySha256:string;topology:string;anchors:SurfaceAnchor[];vertexAnchors:number[];weights:{joints:number[];weights:number[]}[];coverageTriangles:number[]}>;
 regions:Record<string,{contact:number[];free:number[];boundary:number[]}>;
 seams:number[][];
 coverageRimContacts?:number[];
 coverageClipPlanes?:{regions:string[];regionMatch?:'all'|'any';normal:number[];constant:number}[];
 garmentFrames:Record<string,{vertex:number;quaternion:readonly [number,number,number,number]}>;
 dependency?:{module:string;frame:string};
}
