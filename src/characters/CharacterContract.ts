import { characterDNAVersion, characterRanges, appearanceFitLimits } from './CharacterDNA';
import { attachmentVersion } from './AttachmentContract';
import { humanMorphNames } from './UniversalHumanProfile';

/** Shared by Lab, World and validator. Metres, +Y up, +Z front. */
export const characterContract={
    version:1,dnaVersion:characterDNAVersion,attachmentVersion,ranges:characterRanges,appearanceFitLimits,
    rig:'PillagersHumanRig',up:[0,1,0],front:[0,0,1],origin:'ground-between-feet',
    animations:['Idle','Walk','Run'],morphs:humanMorphNames,
    bones:['Root','Hips','Spine_01','Spine_02','Chest','Neck','Head',
        ...['L','R'].flatMap(side=>['Clavicle','UpperArm','UpperArmTwist','LowerArm','Hand','UpperLeg','UpperLegTwist','LowerLeg','Foot','Toe'].map(name=>`${name}_${side}`))],
    legacySockets:['weapon_R','weapon_L','shield','back','hip','head'],
} as const;
