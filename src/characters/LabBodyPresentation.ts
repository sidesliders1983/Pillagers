import { CharacterDNA, characterRanges } from './CharacterDNA';
import { HumanMorph, HumanProfile, composeHumanBodyWeights, humanBodyShapeStrength, universalHumanProfile } from './UniversalHumanProfile';
import { LabBodySource, LabCandidatePreset, goldenLabBody, labCandidateBodyPresets, labCandidatePresetNames, parseLabBodySource } from './LabBodySources';

export const labBodyRanges={Masculine:[0,1],Feminine:[0,1],Breasts:[0,1],Powerful:[0,1],Slight:[0,1],Agile:[0,1],Grounded:[0,1],Overweight:[0,1],Underweight:[0,1],Age:[0,1],LegRatio:[-.25,.25],ShoulderSlope:[-.2,.2],Asymmetry:[-.175,.175]} as const;
export type LabBodyAxis=keyof typeof labBodyRanges;
export type LabBodyPreset='auto'|'neutral'|LabCandidatePreset;
export interface LabBodyPresentation {version:1;preset:LabBodyPreset;source?:LabBodySource;morphology?:{height?:number};morphs?:Partial<Record<LabBodyAxis,number>>;}
export const defaultLabBodyPresentation:Readonly<LabBodyPresentation>=Object.freeze({version:1,preset:'auto'});
export const previewLabBodyPresentation:Readonly<LabBodyPresentation>=Object.freeze({version:1,preset:'neutral',source:goldenLabBody.source});
export const labBodyOppositePairs=[['Masculine','Feminine'],['Powerful','Slight'],['Agile','Grounded'],['Overweight','Underweight']] as const;
const reducedPrimary:LabBodyAxis[]=['Masculine','Feminine','Breasts','Powerful','Slight','Agile','Grounded','Overweight','Underweight'];
export function parseLabBodyPresentation(value:unknown=defaultLabBodyPresentation):LabBodyPresentation {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Lab body presentation must be an object.');
    const b=value as LabBodyPresentation,source=parseLabBodySource(b.source);
    const presets:readonly string[]=source===goldenLabBody.source?['auto','neutral',...labCandidatePresetNames]:['auto','neutral'];
    if(Object.keys(b).some(key=>!['version','preset','source','morphology','morphs'].includes(key))||b.version!==1||!presets.includes(b.preset))throw new Error('Unsupported Lab body preset or version for this source.');
    const result:LabBodyPresentation={version:1,preset:b.preset};
    if(b.source!==undefined)result.source=source;
    if(b.morphology!==undefined){
        if(!b.morphology||typeof b.morphology!=='object'||Array.isArray(b.morphology)||Object.keys(b.morphology).some(key=>key!=='height'))throw new Error('Only the existing adult height morphology override is supported.');
        const height=b.morphology.height;
        if(height!==undefined&&(!Number.isFinite(height)||height<characterRanges.height[0]||height>characterRanges.height[1]))throw new Error('Lab height must stay in the existing adult height range.');
        result.morphology={...b.morphology};
    }
    if(b.morphs!==undefined){
        if(!b.morphs||typeof b.morphs!=='object'||Array.isArray(b.morphs))throw new Error('Lab body morphs must be an object.');
        result.morphs={};
        for(const [key,value] of Object.entries(b.morphs)){
            if(!Object.hasOwn(labBodyRanges,key))throw new Error('Unsupported Lab body axis: '+key+'.');
            const bounds=labBodyRanges[key as LabBodyAxis];
            if(typeof value!=='number'||!Number.isFinite(value)||value<bounds[0]||value>bounds[1])throw new Error('Unsupported or out-of-range Lab body axis: '+key+'.');
            result.morphs[key as LabBodyAxis]=value;
        }
        for(const [a,c] of labBodyOppositePairs)if((b.morphs[a]??0)>0&&(b.morphs[c]??0)>0)throw new Error('Opposed body axes '+a+'/'+c+' cannot both be positive.');
    }
    return result;
}
export function resolveLabBodyProfile(dna:CharacterDNA,value:unknown=defaultLabBodyPresentation):{profile:HumanProfile;body:LabBodyPresentation;status:'auto'|'override'|'unsupported-age';rawControls:Record<LabBodyAxis,number>} {
    const body=parseLabBodyPresentation(value),base=universalHumanProfile(dna),controls=Object.fromEntries(Object.keys(labBodyRanges).map(key=>[key,base.weights[key as HumanMorph]/(reducedPrimary.includes(key as LabBodyAxis)?humanBodyShapeStrength:1)])) as Record<LabBodyAxis,number>;
    const requested=body.preset!=='auto'||body.morphology?.height!==undefined||Object.keys(body.morphs??{}).length>0;
    if(!requested||base.age<18)return {profile:base,body,status:requested?'unsupported-age':'auto',rawControls:controls};
    const raw={...base.weights};for(const key of reducedPrimary)raw[key]/=humanBodyShapeStrength;
    let height=base.height;
    const recipe=Object.hasOwn(labCandidateBodyPresets,body.preset)?labCandidateBodyPresets[body.preset as LabCandidatePreset]:null;
    if(body.preset==='neutral'||recipe){
        for(const key of Object.keys(labBodyRanges))raw[key as HumanMorph]=0;
        raw.Tall=0;raw.Short=0;height=1.44;
    }
    const requestedHeight=body.morphology?.height??recipe?.height;
    if(requestedHeight!==undefined){height=requestedHeight;const signed=(height-1.44)/(height>=1.44?.24:.28);raw.Tall=Math.min(1,Math.max(0,signed));raw.Short=Math.min(1,Math.max(0,-signed));}
    if(recipe)Object.assign(raw,recipe.morphs);
    const explicit=body.morphs??{};
    for(const [a,c] of labBodyOppositePairs){if(a in explicit&&!(c in explicit))raw[c]=0;if(c in explicit&&!(a in explicit))raw[a]=0;}
    Object.assign(raw,explicit);
    if(!('Breasts' in explicit))raw.Breasts=raw.Feminine;
    const weights=composeHumanBodyWeights(raw);
    return {profile:{...base,height,weights},body,status:'override',rawControls:Object.fromEntries(Object.keys(labBodyRanges).map(key=>[key,raw[key as LabBodyAxis]])) as Record<LabBodyAxis,number>};
}
