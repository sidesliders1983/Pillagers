"""Select an already-authored GLB UV domain without changing its geometry/art."""
import argparse,hashlib,json,struct
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--texcoord',type=int,required=True);a=p.parse_args()
assert a.source.is_file() and not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
blob=a.source.read_bytes();size=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+size]);semantic='TEXCOORD_'+str(a.texcoord)
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:
  assert semantic in primitive['attributes'];primitive['attributes']['TEXCOORD_0']=primitive['attributes'][semantic]
  for key in list(primitive['attributes']):
   if key.startswith('TEXCOORD_') and key!='TEXCOORD_0':del primitive['attributes'][key]
for material in doc['materials']:
 pbr=material['pbrMetallicRoughness'];pbr['baseColorTexture']['texCoord']=0;pbr.pop('metallicRoughnessTexture',None);pbr['metallicFactor']=0;pbr['roughnessFactor']=1
 material.pop('normalTexture',None);material.pop('occlusionTexture',None)
text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4);binary=blob[20+size:]
output=struct.pack('<III',0x46546c67,2,20+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+binary;a.output.write_bytes(output)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(blob).hexdigest(),'outputSha256':hashlib.sha256(output).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'geometryOptimization':{'selectedAuthoredTexcoord':semantic,'geometryChanged':False,'policy':'select existing original-pigment facet atlas UV domain; discard obsolete packed shader-map references'}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('SOURCE_UV_DOMAIN',a.output,semantic)
