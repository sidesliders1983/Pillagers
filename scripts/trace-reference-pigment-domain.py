"""Read original GLB pigment/UV geometry without importing a dense Blender scene.

The source colour domain is classified before simplification.  Geometry,
handedness and authored bounds are retained in the measured source head frame.
"""
import argparse,struct,json,hashlib,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--kind',required=True);p.add_argument('--style',required=True);p.add_argument('--source-anatomy',type=Path);p.add_argument('--maximum-value',type=float,default=.55);p.add_argument('--maximum-red-excess',type=float);p.add_argument('--maximum-red-fraction',type=float);p.add_argument('--maximum-green-blue-distance',type=float);p.add_argument('--maximum-green-minus-blue',type=float);p.add_argument('--minimum-saturation',type=float,default=0);p.add_argument('--closing-pixels',type=int,default=2);p.add_argument('--minimum-height',type=float,default=-.4);p.add_argument('--maximum-height',type=float,default=-.008);p.add_argument('--whole-surface',action='store_true');p.add_argument('--pigment-rgb',type=float,nargs=3);p.add_argument('--maximum-pigment-chroma-distance',type=float,default=.025);p.add_argument('--skin-rgb',type=float,nargs=3);p.add_argument('--minimum-skin-chroma-margin',type=float,default=.002);p.add_argument('--accent-rgb',type=float,nargs=3);p.add_argument('--maximum-accent-chroma-distance',type=float,default=.035);p.add_argument('--maximum-accent-value',type=float,default=.95);p.add_argument('--minimum-accent-height',type=float,default=-1);p.add_argument('--maximum-accent-height',type=float,default=1);a=p.parse_args();assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
raw=a.source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def accessor(index):
 ac=doc['accessors'][index];view=doc['bufferViews'][ac['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[ac['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[ac['type']];item=np.dtype(dtype).itemsize;offset=view.get('byteOffset',0)+ac.get('byteOffset',0);stride=view.get('byteStride',width*item)
 values=np.ndarray((ac['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,item)).copy()
 return values[:,0] if width==1 else values
primitive=doc['meshes'][0]['primitives'][0];assert len(doc['meshes'])==1 and len(doc['meshes'][0]['primitives'])==1
meshnode=next(node for node in doc['nodes'] if node.get('mesh')==0)
assert not meshnode.get('matrix') and not meshnode.get('translation') and not meshnode.get('rotation') and not meshnode.get('scale'), 'Dense source has a transformed node: bake its scene frame explicitly before tracing'
gl=accessor(primitive['attributes']['POSITION']);uv=accessor(primitive['attributes']['TEXCOORD_0']);indices=accessor(primitive['indices']).reshape(-1,3);coords=np.stack((gl[:,0],-gl[:,2],gl[:,1]),axis=1)
frame=json.loads(Path('scratch/appearance-pass/head-frames.json').read_text())[a.kind+'/'+a.style];axis_size=[frame['radius']*2]*3
if a.source_anatomy:
 report=json.loads(a.source_anatomy.read_text());assert report['sourceSha256']==hashlib.sha256(raw).hexdigest();frame=report['frameProposal'];axis_size=frame['headBoundsInFrame']['size']
centre=np.asarray(frame['centre'],dtype=float);up=np.asarray(frame['up'],dtype=float);up/=np.linalg.norm(up);front=np.asarray(frame['front'],dtype=float);front-=up*np.dot(front,up);front/=np.linalg.norm(front);right=np.cross(front,up);right/=np.linalg.norm(right)
matrix=np.asarray([-right*.1992/axis_size[0],-front*.2189/axis_size[2],up*.2397/axis_size[1]]);canonical=(coords-centre)@matrix.T;centres=canonical[indices].mean(axis=1)
mat=doc['materials'][primitive.get('material',0)];texture=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];image_index=texture.get('source',texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source'));image=doc['images'][image_index];view=doc['bufferViews'][image['bufferView']];offset=view.get('byteOffset',0);pil=Image.open(io.BytesIO(binary[offset:offset+view['byteLength']])).convert('RGB');rgb=np.asarray(pil).astype(np.float32)/255;value=rgb.max(2);saturation=(value-rgb.min(2))/np.maximum(value,1e-6)
mask=(value>.03)&(value<a.maximum_value)&(saturation>=a.minimum_saturation)
if a.kind=='beard':mask&=saturation<.65
if a.maximum_red_excess is not None:mask&=(rgb[:,:,0]-rgb[:,:,1])/np.maximum(rgb[:,:,0],1e-6)<a.maximum_red_excess
if a.maximum_red_fraction is not None:mask&=rgb[:,:,0]/np.maximum(rgb.sum(2),1e-6)<=a.maximum_red_fraction
if a.maximum_green_blue_distance is not None:mask&=abs(rgb[:,:,1]-rgb[:,:,2])<a.maximum_green_blue_distance
if a.maximum_green_minus_blue is not None:mask&=(rgb[:,:,1]-rgb[:,:,2])<=a.maximum_green_minus_blue
if a.pigment_rgb is not None:
 seed=np.asarray(a.pigment_rgb,dtype=float);seed/=seed.sum();chroma=rgb/np.maximum(rgb.sum(2,keepdims=True),1e-6)
 pigment_distance=np.linalg.norm(chroma-seed,axis=2);mask&=pigment_distance<=a.maximum_pigment_chroma_distance
 if a.skin_rgb is not None:
  # Distinguish the measured source's shadowed skin from genuine pigment even
  # when both share an encoded brightness. Native chroma families are measured
  # separately for every generation; their red-share ordering can reverse.
  skin_seed=np.asarray(a.skin_rgb,dtype=float);skin_seed/=skin_seed.sum()
  mask&=pigment_distance+a.minimum_skin_chroma_margin<=np.linalg.norm(chroma-skin_seed,axis=2)
elif a.skin_rgb is not None:raise ValueError('Measured skin ownership requires a measured main pigment family')
mask_image=Image.fromarray(mask.astype(np.uint8)*255)
if a.closing_pixels:
 size=a.closing_pixels*2+1;mask_image=mask_image.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
mask=np.asarray(mask_image)>0;tex=uv[indices].mean(axis=1);tex_y=np.clip((tex[:,1]*pil.height).astype(int),0,pil.height-1);tex_x=np.clip((tex[:,0]*pil.width).astype(int),0,pil.width-1);selected=mask[tex_y,tex_x]
# A reference's ties/bands are a separate measured pigment family. Preserve
# those authored facets before reduction; a dark-hair filter may otherwise
# detach the actual lower braid. This does not create a bridge or new outline.
accent_faces=0
if a.accent_rgb is not None:
 seed=np.asarray(a.accent_rgb,dtype=float);seed/=seed.sum();chroma=rgb/np.maximum(rgb.sum(2,keepdims=True),1e-6)
 accent=(np.linalg.norm(chroma-seed,axis=2)<=a.maximum_accent_chroma_distance)&(value>.03)&(value<=a.maximum_accent_value)
 accent_selected=accent[tex_y,tex_x]&(centres[:,2]>=a.minimum_accent_height)&(centres[:,2]<=a.maximum_accent_height)
 accent_faces=int((accent_selected&~selected).sum());selected|=accent_selected
if a.kind=='beard':selected&=(centres[:,2]<a.maximum_height)&(centres[:,2]>a.minimum_height)&(centres[:,1]<.075)
ids=np.flatnonzero(selected);used=np.unique(indices if a.whole_surface else indices[ids]);mapping=np.full(len(coords),-1,dtype=np.int32);mapping[used]=np.arange(len(used))
if a.whole_surface:np.savez_compressed(a.output,positions=canonical[used].astype(np.float32),faces=mapping[indices],pigment=selected)
else:np.savez_compressed(a.output,positions=canonical[used].astype(np.float32),faces=mapping[indices[ids]])
mask_image.thumbnail((1024,1024));mask_image.save(a.output.with_suffix('.pigment-mask.png'))
record={'reviewRequired':True,'kind':a.kind,'style':a.style,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig')),'geometryOptimization':{'rawTriangles':len(indices),'classifiedReferenceTriangles':len(ids),'classificationOrder':'original encoded base-colour texture before geometry simplification','maximumPigmentValue':a.maximum_value,'maximumPigmentRedExcess':a.maximum_red_excess,'maximumGreenBlueDistance':a.maximum_green_blue_distance,'maximumGreenMinusBlue':a.maximum_green_minus_blue,'minimumPigmentSaturation':a.minimum_saturation,'completeReferenceVolume':a.whole_surface,'textureClosingRadiusPixels':a.closing_pixels,'minimumHeightMeters':a.minimum_height,'sourceAxisSize':axis_size,'sourceAnatomySha256':hashlib.sha256(a.source_anatomy.read_bytes()).hexdigest() if a.source_anatomy else None},'fit':{'authoringFrame':'canonical','up':'+Y','front':'+Z','origin':'fixed skull centre','canonicalHeadSize':[.1992,.2397,.2189]}}
frame_file=a.source_anatomy or Path('scratch/appearance-pass/head-frames.json')
record['sourceHeadFrame']={'path':str(frame_file.resolve()),'sha256':hashlib.sha256(frame_file.read_bytes()).hexdigest(),'entry':a.kind+'/'+a.style,'measuredFrame':frame,'axisScale':axis_size,'canonicalBlenderBasis':'-right, -front, +up','canonicalGlTFBasis':'-right, +up, +front'}
record['geometryOptimization']['textureCoordinates']='glTF TEXCOORD_0 native image row v, upper-left; no vertical inversion'
record['geometryOptimization']['maximumNormalizedRedFraction']=a.maximum_red_fraction
record['geometryOptimization']['maximumHeightMeters']=a.maximum_height if a.kind=='beard' else None
record['geometryOptimization']['referenceAccentPigment']={'encodedRGBSeed':a.accent_rgb,'maximumNormalizedChromaDistance':a.maximum_accent_chroma_distance,'maximumValue':a.maximum_accent_value,'canonicalHeightRange':[a.minimum_accent_height,a.maximum_accent_height],'additionalOriginalFaces':accent_faces} if a.accent_rgb else None
record['geometryOptimization']['referenceMainPigment']={'encodedRGBSeed':a.pigment_rgb,'maximumNormalizedChromaDistance':a.maximum_pigment_chroma_distance} if a.pigment_rgb else None
record['geometryOptimization']['referenceSkinOwnership']={'encodedRGBSeed':a.skin_rgb,'minimumNormalizedChromaMargin':a.minimum_skin_chroma_margin,'comparison':'retain native pigment only when closer to its measured chroma family than measured source skin'} if a.skin_rgb else None
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record['geometryOptimization']),flush=True)
