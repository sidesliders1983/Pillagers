import { Box3, Vector3 } from 'three';

export const attachmentVersion='pillagers-fit/0.1' as const;
export const coverageZones=['HEAD','NECK','TORSO_UPPER','TORSO_LOWER','PELVIS','UPPER_ARM_L','UPPER_ARM_R','LOWER_ARM_L','LOWER_ARM_R','UPPER_LEG_L','UPPER_LEG_R','LOWER_LEG_L','LOWER_LEG_R','FEET'] as const;
export type CoverageZone=typeof coverageZones[number];
export const cageNames=['HEAD_CAGE','LOWER_FACE_CAGE','TORSO_CAGE','PELVIS_CAGE'] as const;
export type CageName=typeof cageNames[number];
export const landmarkNames=['HEAD_TOP','FOREHEAD','TEMPLE_L','TEMPLE_R','EAR_L','EAR_R','OCCIPUT','CHIN','JAW_L','JAW_R','UNDER_CHIN','NECK_FRONT','NECK_BACK','CLAVICLE_L','CLAVICLE_R','CHEST_CENTER','BACK_CENTER','WAIST_FRONT','WAIST_BACK','HIP_L','HIP_R','HAND_GRIP_L','HAND_GRIP_R','FOREARM_L','FOREARM_R'] as const;
export type LandmarkName=typeof landmarkNames[number];
export const socketDefinitions={
    socket_head_top:{bone:'Head',landmark:'HEAD_TOP'},socket_face:{bone:'Head',landmark:'FOREHEAD'},
    socket_jaw:{bone:'Head',landmark:'CHIN'},socket_neck:{bone:'Neck',landmark:'NECK_FRONT'},socket_back_head:{bone:'Head',landmark:'OCCIPUT'},
    socket_chest:{bone:'Chest',landmark:'CHEST_CENTER'},socket_back:{bone:'Chest',landmark:'BACK_CENTER'},
    socket_shoulder_L:{bone:'UpperArm_L',landmark:'CLAVICLE_L'},socket_shoulder_R:{bone:'UpperArm_R',landmark:'CLAVICLE_R'},
    socket_waist:{bone:'Hips',landmark:'WAIST_FRONT'},socket_hip_L:{bone:'Hips',landmark:'HIP_L'},socket_hip_R:{bone:'Hips',landmark:'HIP_R'},
    socket_hand_L:{bone:'Hand_L',landmark:'HAND_GRIP_L'},socket_hand_R:{bone:'Hand_R',landmark:'HAND_GRIP_R'},socket_forearm_L:{bone:'LowerArm_L',landmark:'FOREARM_L'},socket_forearm_R:{bone:'LowerArm_R',landmark:'FOREARM_R'},
} as const;
export type SocketName=keyof typeof socketDefinitions;
export interface ModuleMetadata {
    version:typeof attachmentVersion;
    id:string;
    type:'hair'|'beard'|'mask'|'garment'|'equipment';
    anchor:SocketName;
    fitCage?:CageName;
    fitMode:'conform'|'drape'|'rigid';
    slot?:'upper'|'lower'|'full'|'over';
    covers?:CoverageZone[];
    clearance:number;
    /** All imported geometry must first be calibrated to +Y up, +Z front. */
    authoringFrame:'canonical'|'measured-reference-head';
    sourceStyle?:string;
    canonicalHeadSize?:readonly [number,number,number];
    attachmentBand?:{minimumY:number|null;maximumY?:number|null};
    projection?:'shell'|'outward';
    subdivisions?:number;
    trim?:{min:readonly (number|null)[];max:readonly (number|null)[]};
}
export function validateModule(metadata:ModuleMetadata){
    if(metadata.version!==attachmentVersion||!metadata.id||!(metadata.anchor in socketDefinitions))throw new Error('Invalid attachment contract or socket.');
    if(metadata.fitMode!=='rigid'&&(!metadata.fitCage||!cageNames.includes(metadata.fitCage)))throw new Error('A fitted module needs a known cage.');
    if(!Number.isFinite(metadata.clearance)||metadata.clearance<0)throw new Error('Module clearance must be non-negative.');
    if(metadata.covers?.some(zone=>!coverageZones.includes(zone)))throw new Error('Unknown body coverage zone.');
    if(metadata.type==='garment'&&(!metadata.slot||metadata.fitMode!=='drape'||metadata.authoringFrame!=='canonical'))throw new Error('Garments need a slot and canonical drape frame.');
    if(metadata.canonicalHeadSize?.some(value=>!Number.isFinite(value)||value<=0))throw new Error('Invalid canonical head dimensions.');
    if((metadata.type==='hair'||metadata.type==='beard')&&metadata.fitMode!=='conform')throw new Error('Hair and beard modules use conform fitting.');
    if(metadata.type==='equipment'&&metadata.fitMode!=='rigid')throw new Error('Equipment uses a rigid socket.');
    if(metadata.authoringFrame==='measured-reference-head'&&!metadata.sourceStyle)throw new Error('Measured head modules need their source calibration key.');
    const band=metadata.attachmentBand;if(band){for(const value of [band.minimumY,band.maximumY])if(value!=null&&!Number.isFinite(value))throw new Error('Use null for an unbounded attachment band.');}
    return metadata;
}
export interface FitVolume {name:CageName;points:Vector3[];bounds:Box3;canonicalBounds:Box3;}

/** Built-in references use the same metadata path as future registered modules. */
export function appearanceMetadata(kind:'hair'|'beard',style:string):ModuleMetadata {
    return validateModule({version:attachmentVersion,id:`${kind}/${style}`,type:kind,
        anchor:kind==='hair'?'socket_head_top':'socket_jaw',fitCage:kind==='hair'?'HEAD_CAGE':'LOWER_FACE_CAGE',fitMode:'conform',
        clearance:kind==='hair'?.004:.003,authoringFrame:'measured-reference-head',sourceStyle:style,
        projection:kind==='beard'?'shell':'outward',subdivisions:kind==='beard'&&style==='stubble'?2:0,
        attachmentBand:kind==='hair'?{minimumY:-.45}:{minimumY:style==='stubble'?null:-.075/.2397},
        // Extraction cleanup recorded in normalized head coordinates, not a DNA offset.
        ...(kind==='hair'&&style==='long'?{trim:{min:[-.24,null,.16],max:[.24,-.32,null]}}:{}),
    });
}
