"""Reconstruct a bounded concave envelope from existing free-hair facets.

The native reference silhouette supplies every sample. No new hairstyle or
runtime fit rule is introduced. A source must have canonical authoring axes;
the measured HEAD cage separates scalp/face residue from genuine free strands.
The output remains reviewRequired until independent source and browser review.
"""
import argparse,json,hashlib,struct
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull,Delaunay
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--head-cage',type=Path,required=True);p.add_argument('--radius',type=float,default=.014);p.add_argument('--spacing',type=float,default=.006);p.add_argument('--minimum-absolute-x',type=float);p.add_argument('--maximum-x',type=float);p.add_argument('--minimum-posterior',type=float,default=.02);a=p.parse_args();assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
raw=a.source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def get(index):
 ac=doc['accessors'][index];v=doc['bufferViews'][ac['bufferView']];typ={5126:'<f4',5125:'<u4',5123:'<u2'}[ac['componentType']];width={'SCALAR':1,'VEC3':3}[ac['type']];arr=np.ndarray((ac['count'],width),typ,buffer=binary,offset=v.get('byteOffset',0)+ac.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(typ).itemsize*width),np.dtype(typ).itemsize)).copy();return arr[:,0] if width==1 else arr
primitive=doc['meshes'][0]['primitives'][0];gl=get(primitive['attributes']['POSITION']);pos=np.stack((gl[:,0],-gl[:,2],gl[:,1]),axis=1);faces=get(primitive['indices']).reshape(-1,3);cage=json.loads(a.head_cage.read_text());pts=np.array(cage['points'])*np.array([.1992,.2397,.2189])/np.array(cage['size']);pts=np.stack((pts[:,0],-pts[:,2],pts[:,1]),axis=1);h=ConvexHull(pts);normal=h.equations[:,:3];constant=-h.equations[:,3]
def support(points):
 direction=points/np.linalg.norm(points,axis=-1,keepdims=True);dots=direction@normal.T;return np.min(np.where(dots>1e-6,constant/np.maximum(dots,1e-6),np.inf),axis=-1)
kept=[];samples=[]
for face in faces:
 q=pos[face];centre=q.mean(0);sr=support(centre[None,:])[0];vr=support(q);badface=((abs(q[:,0])<.06)&(q[:,2]>-.15)&(q[:,2]<.025)&(q[:,1]<.055)&(np.linalg.norm(q,axis=1)-vr<.03)).any();neck=abs(centre[0])<.055 and -.02<centre[1]<.085 and centre[2]<-.10;region=centre[2]<-.15 or (q[:,1]>=a.minimum_posterior).all() or (a.minimum_absolute_x is not None and (abs(q[:,0])>=a.minimum_absolute_x).all()) or (a.maximum_x is not None and (q[:,0]<=a.maximum_x).all())
 if centre[2]<.08 and np.linalg.norm(centre)>sr+.01 and region and not(badface or neck):
  kept.append(face);steps=max(1,int(np.ceil(max(np.linalg.norm(q[1]-q[0]),np.linalg.norm(q[2]-q[0]),np.linalg.norm(q[2]-q[1]))/a.spacing)))
  for i in range(steps+1):
   for j in range(steps+1-i):samples.append(q[0]+(q[1]-q[0])*i/steps+(q[2]-q[0])*j/steps)
samples=np.array(samples);_,first=np.unique(np.round(samples/1e-5).astype(np.int64),axis=0,return_index=True);samples=samples[first];assert len(samples)<45000;d=Delaunay(samples);q=samples[d.simplices];mat=2*(q[:,1:]-q[:,:1]);rhs=(q[:,1:]**2).sum(2)-(q[:,:1]**2).sum(2);good=abs(np.linalg.det(mat))>1e-15;centres=np.full((len(q),3),np.inf);centres[good]=np.linalg.solve(mat[good],rhs[good]);r=np.linalg.norm(centres-q[:,0],axis=1);selected=np.flatnonzero(good&(r<=a.radius));surface=[]
for tid in selected:
 tetra=d.simplices[tid]
 for opposite in range(4):
  neighbour=d.neighbors[tid,opposite]
  if neighbour>=0 and good[neighbour] and r[neighbour]<=a.radius:continue
  face=np.delete(tetra,opposite);fp=samples[face]
  if np.dot(np.cross(fp[1]-fp[0],fp[2]-fp[0]),samples[tetra[opposite]]-fp[0])>0:face=face[[0,2,1]]
  surface.append(face)
surface=np.array(surface,dtype=np.int32);used=np.unique(surface);mapping=np.full(len(samples),-1,dtype=np.int32);mapping[used]=np.arange(len(used));np.savez_compressed(a.output,positions=samples[used].astype(np.float32),faces=mapping[surface]);parent=json.loads(a.source.with_suffix('.provenance.json').read_text());stats={'sourceTriangles':len(faces),'retainedOriginalFreeFaces':len(kept),'sourceSurfaceSamples':len(samples),'sampleSpacingMeters':a.spacing,'maximumAlphaCircumradiusMeters':a.radius,'selectedSourceTetrahedra':len(selected),'outputTriangles':len(surface),'outlineExtremaSourceDerived':True};record={'reviewRequired':True,'kind':'hair','style':parent['style'],'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':parent,'fit':parent['fit'],'geometryOptimization':stats};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2));print(json.dumps(stats),flush=True)
