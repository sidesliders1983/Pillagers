"""Measure native skin/fabric/boot pigment votes from an immutable UV cache.

No geometry or colour is authored. Exact native head, covered-torso and foot
samples determine conservative nearest-colour ownership; ambiguous warm gear
is retained and reported. The output mask is pinned to the cache SHA.
"""
import argparse,hashlib,json,numpy as np
from pathlib import Path
from scipy.spatial import cKDTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('cache',type=Path);p.add_argument('frame',type=Path);p.add_argument('bind',type=Path);p.add_argument('output',type=Path);a=p.parse_args();assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
data=np.load(a.cache);pts=data['positions'];tri=data['triangles'];rgb=data['linearRGB'];c=pts[tri].mean(axis=1);lo=pts[:,2].min();span=pts[:,2].max()-lo;head_mask=(c[:,2]>lo+span*.88)&(c[:,2]<lo+span*.97)&(rgb[:,0]>rgb[:,1]*1.12)&(rgb[:,0]>rgb[:,2]*1.15);head=rgb[head_mask];skin=np.median(head,axis=0);sc=skin/skin.sum();ch=rgb/np.maximum(rgb.sum(axis=1,keepdims=True),1e-6);flesh=(np.linalg.norm(ch-sc,axis=1)<.075)&(rgb[:,0]>rgb[:,1]*1.25)&(rgb[:,0]<rgb[:,1]*1.95)&(ch[:,0]-ch[:,2]>.12)
frame=json.load(open(a.frame))['fit'];bind=json.load(open(a.bind))['joints'];m=(c-np.asarray(frame['sourceCentreBlender']))*frame['scale']
if frame.get('rotateBlenderZ')==180:m[:,:2]*=-1
joint=lambda name:np.asarray([bind[name][0],-bind[name][2],bind[name][1]])
def distance(first,last):
 start=joint(first);axis=joint(last)-start;t=np.clip((m-start)@axis/(axis@axis),0,1);return np.linalg.norm(m-start-t[:,None]*axis,axis=1)
arm=np.minimum(distance('UpperArm_L','LowerArm_L'),distance('UpperArm_R','LowerArm_R'));torso=distance('Hips','Chest');covered=(m[:,2]>joint('Hips')[2]+.08)&(m[:,2]<joint('Chest')[2]+.03)&(torso<arm)
foot_y=np.mean([bind['Foot_'+side][1] for side in ['L','R']]);knee_y=np.mean([bind['LowerLeg_'+side][1] for side in ['L','R']]);boot_limit=foot_y+(knee_y-foot_y)/4;boots=m[:,2]<boot_limit;torso_palette=covered&~flesh
head_palette=np.unique(head,axis=0);gear_palette=np.unique(rgb[boots|torso_palette],axis=0);assert len(head_palette)>30 and len(gear_palette)>30
skin_distance=cKDTree(head_palette).query(rgb,workers=1)[0];gear_distance=cKDTree(gear_palette).query(rgb,workers=1)[0];remove=flesh&~covered&(skin_distance<.04)&(skin_distance+.015<gear_distance)
y=(c[:,2]-lo)*1.8/span;style=a.cache.parent.name;x=np.abs(c[:,0]-(pts[:,0].min()+pts[:,0].max())*.5)*1.8/span;cuff={'cream-tunic':1.18,'mantle-tunic':1.06,'long-dress':1.45}[style];arm_limit=.21 if style=='long-dress' else .28;arm_floor=1.12 if style=='long-dress' else .60;selection=(y<=1.50)&~((y>1.40)&(x<.075))&~((y>arm_floor)&(y<cuff)&(x>arm_limit))
if style=='long-dress':selection&=~((y>.65)&(y<1.12)&(x>.24)&(rgb[:,0]>rgb[:,1]*1.3)&(rgb[:,0]>rgb[:,2]*1.5))
original_selection=selection&((~flesh)|(y<1.12)|covered);removed=original_selection&remove;ambiguous=original_selection&flesh&~covered&~remove;bins=[]
for low,high in [(0,.27),(.27,.49),(.49,.67),(.67,.9),(.9,1.12),(1.12,1.5)]:
 selected=removed&(y>=low)&(y<high);bins.append({'heightBin':[low,high],'removedNativeSkinFacets':int(selected.sum()),'meanRemovedNativeRGB':rgb[selected].mean(axis=0).tolist() if selected.any() else None})
sha=hashlib.sha256(a.cache.read_bytes()).hexdigest();np.savez_compressed(a.output,removeNativeSkin=remove,cacheSha256=np.asarray(sha),nativeSkinDistance=skin_distance.astype(np.float32),nativeGearDistance=gear_distance.astype(np.float32))
source_ids=data['originalFace'];report={'cache':str(a.cache.resolve()),'cacheSha256':sha,'sourceStyle':style,'headNativePaletteColours':len(head_palette),'gearNativePaletteColours':len(gear_palette),'headRGB':skin.tolist(),'nativeFootwearTrainingHeightMetres':float(boot_limit),'authority':'immutable original UV/head native skin; measured17 covered-torso fabric and foot/ankle boot pigments','decision':'remove only native skin within40milliRGB and15milliRGB closer than measured native gear; covered torso protected; no blanket lower-body exemption','sourceSkinFacetsRemovedFromExistingDomain':int(removed.sum()),'retainedWarmGearOrAmbiguousFacets':int(ambiguous.sum()),'bins':bins,'removedOriginalFaceIDs':np.unique(source_ids[removed]).tolist(),'retainedOriginalFaceIDs':np.unique(source_ids[ambiguous]).tolist(),'maskSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()};a.output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({key:value for key,value in report.items() if not key.endswith('IDs')},indent=2))
