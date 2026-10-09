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
export const equipmentSocketNames=['socket_hand_L','socket_hand_R','socket_hip_L','socket_hip_R','socket_back'] as const;
export type EquipmentSocket=typeof equipmentSocketNames[number];
export interface RigidFrame {position:readonly [number,number,number];quaternion:readonly [number,number,number,number];}
/** Source-measured item-local grip and supported socket-local carry frames. */
export interface EquipmentBindings {grip:RigidFrame;sockets:Partial<Record<EquipmentSocket,RigidFrame>>;
    /** Source-bound fixed hand core controls the whole rigid item for every carry.
     * Uniform proportion is captured in neutral refit, never from animation. */
    proportions?:{bodyCore:'hand_L'|'hand_R';referenceRadius:number;sourceSHA256:string};
}

/** Measured neutral joints of a generated reference figure, before fitting.
 * Positions share the canonical metre/+Y/+Z frame; they are asset authoring data.
 */
export const garmentBindBones=['Hips','Chest','Neck','UpperArm_L','UpperArm_R','LowerArm_L','LowerArm_R','Hand_L','Hand_R','UpperLeg_L','UpperLeg_R','LowerLeg_L','LowerLeg_R','Foot_L','Foot_R','Toe_L','Toe_R'] as const;
export type GarmentBindBone=typeof garmentBindBones[number];
export interface ModuleMetadata {
    version:typeof attachmentVersion|'pillagers-fit/0.2';
    id:string;
    type:'hair'|'beard'|'mask'|'garment'|'equipment';
    anchor:SocketName;
    fitCage?:CageName;
    /** Optional authored contact subset; complete cage still governs collisions. */
    fitContactZones?:CoverageZone[];
    fitMode:'conform'|'drape'|'rigid';
    equipmentBindings?:EquipmentBindings;
    slot?:'upper'|'lower'|'full'|'over';
    covers?:CoverageZone[];
    /** Partial sleeves keep the uncovered arm below the source cuff visible. */
    coverageBands?:Partial<Record<CoverageZone,{minY?:number;maxY?:number}>>;
    clearance:number;
    /** All imported geometry must first be calibrated to +Y up, +Z front. */
    authoringFrame:'canonical'|'measured-reference-head'|'meshy-native';
    nativeBinding?:{path:string;sha256:string;rigSignature:string};
    dependency?:{module:string;frame:string};
    accessorySlot?:'belt';
    sourceStyle?:string;
    canonicalHeadSize?:readonly [number,number,number];
    attachmentBand?:{minimumY:number|null;maximumY?:number|null};
    projection?:'shell'|'outward';
    subdivisions?:number;
    /** Reference-derived outfits contain separately tagged skirt/mantle/boot surfaces. */
    garmentFit?:'regional';
    garmentBind?:{joints:Record<GarmentBindBone,readonly [number,number,number]>};
    trim?:{min:readonly (number|null)[];max:readonly (number|null)[]};
}
export function validateModule(metadata:ModuleMetadata){
    if(metadata.version==='pillagers-fit/0.2'){
        const binding=metadata.nativeBinding;
        if(!metadata.id||!['hair','beard','garment','equipment'].includes(metadata.type)||metadata.authoringFrame!=='meshy-native'||!Object.hasOwn(socketDefinitions,metadata.anchor)||!binding||!/^\/[\w/-]+\.binding\.json$/.test(binding.path)||![/^[a-f0-9]{64}$/.test(binding.sha256),/^[a-f0-9]{64}$/.test(binding.rigSignature)].every(Boolean)||!Number.isFinite(metadata.clearance)||metadata.clearance<0)throw new Error('Invalid native body-bound module contract');
        if(metadata.type==='garment'&&(metadata.fitMode!=='drape'||!['upper','lower','full','over'].includes(metadata.slot??'')))throw new Error('Native garments require wardrobe occupancy');
        if((metadata.type==='hair'||metadata.type==='beard')&&metadata.fitMode!=='conform')throw new Error('Native head modules require conform bindings');
        if(metadata.type==='equipment'&&(metadata.fitMode!=='rigid'||metadata.accessorySlot!=='belt'||!metadata.dependency?.module||!metadata.dependency.frame))throw new Error('Native accessories require a declared garment frame');
        return metadata;
    }
    if(!['hair','beard','mask','garment','equipment'].includes(metadata.type)||!['conform','drape','rigid'].includes(metadata.fitMode)||!['canonical','measured-reference-head'].includes(metadata.authoringFrame))throw new Error('Unknown module type, fit mode or authoring frame.');
    if(metadata.version!==attachmentVersion||!metadata.id||!Object.hasOwn(socketDefinitions,metadata.anchor))throw new Error('Invalid attachment contract or socket.');
    if(metadata.fitMode!=='rigid'&&(!metadata.fitCage||!cageNames.includes(metadata.fitCage)))throw new Error('A fitted module needs a known cage.');
    if('fitContactZones' in metadata){
        const zones=metadata.fitContactZones;
        if(!Object.hasOwn(metadata,'fitContactZones')||!Array.isArray(zones)||!zones.length||new Set(zones).size!==zones.length||Array.from(zones).some(zone=>!coverageZones.includes(zone)))throw new Error('Contact fit zones must be a nonempty unique list of known coverage zones.');
        if(metadata.fitMode==='rigid'||!metadata.fitCage||!cageNames.includes(metadata.fitCage))throw new Error('Contact fit zones require a fitted cage.');
    }
    if(!Number.isFinite(metadata.clearance)||metadata.clearance<0)throw new Error('Module clearance must be non-negative.');
    if(metadata.covers?.some(zone=>!coverageZones.includes(zone)))throw new Error('Unknown body coverage zone.');
    if(metadata.coverageBands)for(const [zone,band] of Object.entries(metadata.coverageBands)){
        if(!metadata.covers?.includes(zone as CoverageZone)||[band.minY,band.maxY].some(v=>v!==undefined&&!Number.isFinite(v))||(band.minY??-Infinity)>(band.maxY??Infinity))throw new Error('Invalid partial coverage band.');
    }
    if(metadata.type==='garment'&&(!['upper','lower','full','over'].includes(metadata.slot??'')||metadata.fitMode!=='drape'||metadata.authoringFrame!=='canonical'))throw new Error('Garments need a slot and canonical drape frame.');
    if(metadata.garmentFit!==undefined&&(metadata.type!=='garment'||metadata.garmentFit!=='regional'))throw new Error('Invalid garment fit policy.');
    if(metadata.garmentBind){
        if(metadata.type!=='garment'||metadata.garmentFit!=='regional')throw new Error('A measured garment bind frame needs regional garment fitting.');
        const joints=metadata.garmentBind.joints;
        if(!joints||Object.keys(joints).length!==garmentBindBones.length||garmentBindBones.some(name=>!Array.isArray(joints[name])||joints[name].length!==3||joints[name].some(value=>!Number.isFinite(value))))throw new Error('Invalid measured garment bind joints.');
        if(!(joints.Neck[1]>joints.Chest[1]&&joints.Chest[1]>joints.Hips[1]))throw new Error('Measured garment joints must use canonical +Y up.');
        for(const side of ['L','R'] as const)for(const [start,end] of [['UpperArm','LowerArm'],['LowerArm','Hand'],['UpperLeg','LowerLeg'],['LowerLeg','Foot'],['Foot','Toe']] as const){
            const a=joints[`${start}_${side}`],b=joints[`${end}_${side}`];
            if(Math.hypot(...a.map((value,index)=>value-b[index]))<1e-5)throw new Error('Measured garment limb axes must have nonzero length.');
        }
    }
    if(metadata.canonicalHeadSize&&(metadata.canonicalHeadSize.length!==3||metadata.canonicalHeadSize.some(value=>!Number.isFinite(value)||value<=0)))throw new Error('Invalid canonical head dimensions.');
    if((metadata.type==='hair'||metadata.type==='beard')&&metadata.fitMode!=='conform')throw new Error('Hair and beard modules use conform fitting.');
    if(metadata.type==='equipment'&&(metadata.fitMode!=='rigid'||!Object.hasOwn(metadata,'equipmentBindings')))throw new Error('Equipment uses a rigid socket.');
    if('equipmentBindings' in metadata){
        const bindings=metadata.equipmentBindings;
        const frame=(value:RigidFrame|undefined)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===2&&Object.hasOwn(value,'position')&&Object.hasOwn(value,'quaternion')&&Array.isArray(value.position)&&value.position.length===3&&Array.from(value.position).every(v=>Number.isFinite(v)&&Math.abs(v)<=5)&&Array.isArray(value.quaternion)&&value.quaternion.length===4&&Array.from(value.quaternion).every(Number.isFinite)&&Math.abs(Math.hypot(...value.quaternion)-1)<1e-6;
        if(metadata.type!=='equipment'||metadata.authoringFrame!=='canonical'||!bindings||typeof bindings!=='object'||Array.isArray(bindings)||Object.getPrototypeOf(bindings)!==Object.prototype||Object.keys(bindings).some(key=>!['grip','sockets','proportions'].includes(key))||!Object.hasOwn(bindings,'grip')||!Object.hasOwn(bindings,'sockets')||!frame(bindings.grip)||!bindings.sockets||typeof bindings.sockets!=='object'||Array.isArray(bindings.sockets)||Object.keys(bindings.sockets).length===0||Object.entries(bindings.sockets).some(([socket,value])=>!equipmentSocketNames.includes(socket as EquipmentSocket)||!frame(value))||!Object.hasOwn(bindings.sockets,metadata.anchor))throw new Error('Equipment needs a measured grip and supported canonical carry frames.');
    }
    if(metadata.equipmentBindings&&'proportions' in metadata.equipmentBindings){
        const proportion=metadata.equipmentBindings.proportions;
        if(!Object.hasOwn(metadata.equipmentBindings,'proportions')||!proportion||typeof proportion!=='object'||Array.isArray(proportion)||Object.getPrototypeOf(proportion)!==Object.prototype||Object.keys(proportion).length!==3||!Object.hasOwn(proportion,'bodyCore')||!['hand_L','hand_R'].includes(proportion.bodyCore)||!Object.hasOwn(proportion,'referenceRadius')||!Number.isFinite(proportion.referenceRadius)||proportion.referenceRadius<=1e-6||!Object.hasOwn(proportion,'sourceSHA256')||!/^[a-f0-9]{64}$/.test(proportion.sourceSHA256))throw new Error('Equipment proportions require a source-bound measured fixed hand core.');
    }
    if(metadata.authoringFrame==='measured-reference-head'&&!metadata.sourceStyle)throw new Error('Measured head modules need their source calibration key.');
    const band=metadata.attachmentBand;if(band){for(const value of [band.minimumY,band.maximumY])if(value!=null&&!Number.isFinite(value))throw new Error('Use null for an unbounded attachment band.');if((band.minimumY??-Infinity)>(band.maximumY??Infinity))throw new Error('Attachment band minimum exceeds maximum.');}
    if(metadata.projection!==undefined&&!['shell','outward'].includes(metadata.projection))throw new Error('Unknown contact projection policy.');
    if(metadata.subdivisions!==undefined&&(!Number.isInteger(metadata.subdivisions)||metadata.subdivisions<0||metadata.subdivisions>2))throw new Error('Contact subdivisions must be an integer from zero to two.');
    if(metadata.trim&&(metadata.trim.min.length!==3||metadata.trim.max.length!==3||[...metadata.trim.min,...metadata.trim.max].some(value=>value!==null&&!Number.isFinite(value))||metadata.trim.min.some((value,index)=>value!==null&&metadata.trim!.max[index]!==null&&value>metadata.trim!.max[index]!)))throw new Error('Invalid normalized extraction trim.');
    return metadata;
}
/** A carry choice changes only the supported binding, never source geometry. */
export function moduleAtEquipmentSocket(metadata:ModuleMetadata,socket?:EquipmentSocket):ModuleMetadata {
    validateModule(metadata);
    if(socket===undefined)return metadata;
    if(metadata.version==='pillagers-fit/0.2')throw new Error('This accessory uses its garment frame; a body carry override is unsupported');
    if(metadata.type!=='equipment'||!metadata.equipmentBindings||!Object.hasOwn(metadata.equipmentBindings.sockets,socket))throw new Error('Unsupported equipment carry socket.');
    return validateModule({...metadata,anchor:socket});
}
export interface FitVolume {name:CageName;points:Vector3[];bounds:Box3;canonicalBounds:Box3;}

/** Built-in references use the same metadata path as future registered modules. */
export function appearanceMetadata(kind:'hair'|'beard',style:string):ModuleMetadata {
    return validateModule({version:attachmentVersion,id:`${kind}/${style}`,type:kind,
        anchor:kind==='hair'?'socket_head_top':'socket_jaw',fitCage:kind==='hair'?'HEAD_CAGE':'LOWER_FACE_CAGE',fitMode:'conform',
        clearance:kind==='hair'?.004:.003,authoringFrame:'canonical',sourceStyle:style,
        canonicalHeadSize:[.1992,.2397,.2189],
        projection:kind==='beard'&&style==='stubble'?'shell':'outward',subdivisions:0,
        // The chin/under-chin anchors reach -.54 of the skull height on LOD2.
        // Include their entire contact surface while leaving long free tips free.
        attachmentBand:kind==='hair'?{minimumY:-.45}:style==='stubble'?{minimumY:null,maximumY:null}:{minimumY:-.65},
    });
}
