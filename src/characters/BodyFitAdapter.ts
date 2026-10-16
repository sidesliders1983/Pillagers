import type {Group, Skeleton} from 'three';
import type {CoverageZone, SocketName, RigidFrame} from './AttachmentContract';
export const bodyFitVersion='pillagers-fit/0.2' as const;
export interface SurfaceAnchor {triangle:number;barycentric:readonly [number,number,number];offset:readonly [number,number,number];}
export interface BodySurface {positions:readonly number[];indices:readonly number[];regions:readonly CoverageZone[];triangles:number;}
export interface NativeBodyIdentity {
 id: string;
 sha256: string;
 lod: number;
 rigSignature: string;
 path?: string;
 provenance?: {path: string; sha256: string};
 reviewOnly?: true;
}
/** An explicit source descriptor for a staged Lab review; production defaults stay separate. */
export interface NativeBodySource {
 id: 'body/meshy-human';
 rigSignature: string;
 lods: readonly {lod: 0 | 1 | 2; path: string; sha256: string}[];
 provenance: {path: string; sha256: string};
 reviewOnly: true;
}
/** Body adapters preserve their native rig, coordinate frame and actual source surface. */
export interface BodyFitAdapter {
 readonly version:typeof bodyFitVersion;
 readonly body:NativeBodyIdentity;
 readonly nativeSkeleton:Skeleton;
 readonly sockets:ReadonlyMap<SocketName,Group>;
 readonly revision:number;
 surface(state:'source'|'posed'):BodySurface;
 socketFrame(name:SocketName):RigidFrame & {scale:readonly [number,number,number]};
 refit():void;
}
export interface NativeHairRigBinding {
 version: 1;
 headJoint: number;
 backJoint: number;
 bones: {name: string; position: [number, number, number]}[];
 /** Measured back envelope including braid radius and clothing clearance. */
 rearProfile: [number, number][];
 radius: number;
 clearance: number;
 fixedColor: {color: string; vertices: number[]};
}
export interface ModuleBindingV2 {
 version:typeof bodyFitVersion;id:string;moduleSha256:string;rigSignature:string;
 recipe:{id:string;version:number;blender:string};
 coordinateFrame:{up:'+Y';front:'+Z';unit:'metre';origin:'Meshy source bind'};
 construction:'bilateral'|'intentional-asymmetry';
 skinning?:'authored-four-native'|'rigid-native-head'|'surface-barycentric-native'|'secondary-hair-chain';reviewScope?:string;
 hairRig?: NativeHairRigBinding;
 materialPolicy?:{kind:'provider-original';provider:'Meshy';sourceSha256:string;reviewOnly:true};
 /** Explicit Lab appearance change; cached provider materials and textures remain intact. */
 appearanceOverride?: {kind: 'solid'; color: string; vertexColors?: boolean};
 precomputedNative?: {
  coordinateFrame: 'metre';
  meshes: {mesh: string; vertices: number}[];
  bodyBindings: {lod: number; bodySha256: string; topology: string}[];
 } & ({
  version: 2;
  coverage: {
   arms: import('./BodyCoverage').BodyCutPlane[];
   legs: import('./BodyCoverage').BodyCutPlane[];
   headAbove: number; neckAbove: number; neckHalfWidth: number;
   chestAbove: number; chestFront: number; chestHalfWidth: number; chestSlope: number;
  };
 } | {
  version: 3;
  moduleCoverage: {
   regions: string[];
   minimumY: number;
   maximumY: number;
   /** Retain original triangles touching exposed regions at an opening. */
   preserveRegions?: string[];
  }[];
  /** A source-bound lower garment stays under this shirt's measured hem. */
  lowerUnderlap?: {id: string; moduleSha256: string; maximumY: number;
   hipBlendFromY?: number; hipBlendToY?: number; radialInset?: number};
  neckMaterial?: {minimumY: number; maximumY: number; halfWidth: number; undershirtHalfWidth: number;
   stabilizeSkinWeights?: boolean};
  /** Disjoint exposed native body windows, clipped in the neutral metre frame. */
  bodyOpenings?: {
   minimumY: number;
   maximumY: number;
   planes: {normal: number[]; constant: number}[];
  }[];
 });
 vertexRanges?:{mesh:string;start:number;count:number}[];
 supportedAges:{min:number;max:number};
 lods:Record<number,{bodySha256:string;topology:string;anchors:SurfaceAnchor[];vertexAnchors:number[];weights:{joints:number[];weights:number[]}[];coverageTriangles:number[]}>;
 regions:Record<string,{contact:number[];free:number[];boundary:number[]}>;
 seams:number[][];
 coverageRimContacts?:number[];
 coverageClipPlanes?:{regions:string[];regionMatch?:'all'|'any';normal:number[];constant:number}[];
 garmentFrames:Record<string,{vertex:number;quaternion:readonly [number,number,number,number]}>;
 dependency?:{module:string;frame:string};
}
