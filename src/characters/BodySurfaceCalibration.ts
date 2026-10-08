import { SkinnedMesh } from 'three';
import { CageName, cageNames, CoverageZone, coverageZones, LandmarkName, landmarkNames } from './AttachmentContract';

export const bodySurfaceCalibrationVersion='pillagers-body-surface/1' as const;
export const bodyCoreNames=['head','hand_L','hand_R','foot_L','foot_R'] as const;
export type BodyCoreName=typeof bodyCoreNames[number];
export interface BodySurfaceMeshCalibration {
    name:string;
    neutralPositions:readonly number[];
    triangleIndices:readonly number[];
    coverage:readonly CoverageZone[];
    cages:Record<CageName,readonly number[]>;
    headModuleFrame:readonly number[];
    cores:Record<BodyCoreName,readonly number[]>;
}
export interface BodySurfaceCalibration {
    version:typeof bodySurfaceCalibrationVersion;
    sourceSHA256:string;
    meshes:readonly BodySurfaceMeshCalibration[];
    landmarks:Record<LandmarkName,{mesh:number;vertex:number}>;
}
export type ValidatedBodySurfaceCalibration=Readonly<BodySurfaceCalibration>;
const validated=new WeakSet<object>();
const keys=(value:unknown,expected:readonly string[],name:string)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==expected.length||expected.some(key=>!Object.hasOwn(value,key)))throw new Error('Invalid '+name+' fields.');
};
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
function assertNeutralCorrespondence(entry:BodySurfaceMeshCalibration,source:SkinnedMesh){
    const p=source.geometry.getAttribute('position'),index=source.geometry.index;
    if(!p||p.itemSize!==3||!index||entry.name!==source.name||!Array.isArray(entry.neutralPositions)||entry.neutralPositions.length!==p.count*3||!Array.isArray(entry.triangleIndices)||entry.triangleIndices.length!==index.count)throw new Error('Body neutral topology/correspondence mismatch.');
    for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++){const expected=entry.neutralPositions[i*3+axis],actual=p.getComponent(i,axis);if(!Number.isFinite(expected)||!Number.isFinite(actual)||expected!==actual)throw new Error('Stale body neutral POSITION correspondence.');}
    for(let i=0;i<index.count;i++){const expected=entry.triangleIndices[i];if(!integer(expected)||expected>=p.count||expected!==index.getX(i))throw new Error('Stale body triangle correspondence.');}
}

/** Trusted catalog hash and direct ordered source correspondence; works on LAN HTTP. */
export function validateBodySurfaceCalibration(input:unknown,sourceSHA256:string,meshes:readonly SkinnedMesh[]):ValidatedBodySurfaceCalibration{
    keys(input,['version','sourceSHA256','meshes','landmarks'],'body calibration');
    const value=input as BodySurfaceCalibration;
    if(value.version!==bodySurfaceCalibrationVersion||!sha(value.sourceSHA256)||value.sourceSHA256!==sourceSHA256)throw new Error('Stale body calibration source/version.');
    if(!Array.isArray(value.meshes)||value.meshes.length!==meshes.length||!meshes.length)throw new Error('Body calibration mesh correspondence mismatch.');
    const outputMeshes:BodySurfaceMeshCalibration[]=[];
    for(let mi=0;mi<meshes.length;mi++){
        const source=meshes[mi],entry=value.meshes[mi],p=source.geometry.getAttribute('position'),index=source.geometry.index;
        keys(entry,['name','neutralPositions','triangleIndices','coverage','cages','headModuleFrame','cores'],'body mesh calibration');
        assertNeutralCorrespondence(entry,source);
        if(!Array.isArray(entry.coverage)||entry.coverage.length!==p.count||Array.from(entry.coverage).some(zone=>!(coverageZones as readonly unknown[]).includes(zone)))throw new Error('Invalid body coverage membership.');
        keys(entry.cages,cageNames,'body cages');keys(entry.cores,bodyCoreNames,'body cores');
        const copies=new Map<string,number[]>();
        for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].join(',');const ids=copies.get(key)??[];ids.push(i);copies.set(key,ids);}
        for(const ids of copies.values())if(ids.some(id=>entry.coverage[id]!==entry.coverage[ids[0]]))throw new Error('Split-copy body coverage seam.');
        const region=(ids:readonly number[],name:string,minimum=4)=>{
            if(!Array.isArray(ids)||ids.length<minimum||Array.from(ids).some((id,i)=>!integer(id)||id>=p.count||i>0&&id<=ids[i-1]))throw new Error('Invalid '+name+' index membership.');
            const membership=new Set(ids);for(const copiesOfPoint of copies.values()){const count=copiesOfPoint.filter(id=>membership.has(id)).length;if(count&&count!==copiesOfPoint.length)throw new Error('Split-copy '+name+' membership seam.');}
            return Object.freeze([...ids]);
        };
        const cages=Object.fromEntries(cageNames.map(name=>[name,region(entry.cages[name],name)])) as Record<CageName,readonly number[]>;
        const cores=Object.fromEntries(bodyCoreNames.map(name=>[name,region(entry.cores[name],name)])) as Record<BodyCoreName,readonly number[]>;
        const head=new Set(cages.HEAD_CAGE),headCore=new Set(cores.head);
        if(head.size!==headCore.size||[...head].some(id=>!headCore.has(id)||entry.coverage[id]!=='HEAD')||entry.coverage.some((zone:CoverageZone,id:number)=>zone==='HEAD'&&!head.has(id)))throw new Error('Head cage/core/coverage correspondence mismatch.');
        const allowedCageZones:Record<CageName,readonly CoverageZone[]>={HEAD_CAGE:['HEAD'],LOWER_FACE_CAGE:['HEAD','NECK'],TORSO_CAGE:['TORSO_UPPER','TORSO_LOWER'],PELVIS_CAGE:['PELVIS']};
        for(const name of cageNames)if(cages[name].some(id=>!allowedCageZones[name].includes(entry.coverage[id])))throw new Error('Cage/coverage semantic mismatch.');
        const occupied=new Set<number>();for(const ids of Object.values(cores))for(const id of ids){if(occupied.has(id))throw new Error('Overlapping immutable body cores.');occupied.add(id);}
        const frame=region(entry.headModuleFrame,'head module frame');
        if(frame.some(id=>!head.has(id)))throw new Error('Head module frame must use authored skull surface.');
        outputMeshes.push(Object.freeze({...entry,neutralPositions:Object.freeze([...entry.neutralPositions]),triangleIndices:Object.freeze([...entry.triangleIndices]),coverage:Object.freeze([...entry.coverage]),cages:Object.freeze(cages),cores:Object.freeze(cores),headModuleFrame:frame}));
    }
    keys(value.landmarks,landmarkNames,'body landmarks');
    const landmarks=Object.fromEntries(landmarkNames.map(name=>{
        const anchor=value.landmarks[name];keys(anchor,['mesh','vertex'],'body landmark');
        if(!integer(anchor.mesh)||anchor.mesh>=meshes.length||!integer(anchor.vertex)||anchor.vertex>=outputMeshes[anchor.mesh].coverage.length)throw new Error('Invalid body landmark correspondence.');
        return [name,Object.freeze({...anchor})];
    })) as Record<LandmarkName,{mesh:number;vertex:number}>;
    const result=Object.freeze({version:value.version,sourceSHA256:value.sourceSHA256,meshes:Object.freeze(outputMeshes),landmarks:Object.freeze(landmarks)});
    validated.add(result);return result;
}
export function requireValidatedBodySurfaceCalibration(calibration:ValidatedBodySurfaceCalibration,meshes:readonly SkinnedMesh[]){
    if(!validated.has(calibration))throw new Error('Body surface calibration must be source-validated before fitting.');
    if(calibration.meshes.length!==meshes.length)throw new Error('Cloned body mesh correspondence mismatch.');
    calibration.meshes.forEach((entry,i)=>assertNeutralCorrespondence(entry,meshes[i]));return calibration;
}
