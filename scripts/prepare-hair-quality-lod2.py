"""Prepare existing finer reference hair geometry as the lab's fixed LOD2.

Usage: python scripts/prepare-hair-quality-lod2.py SCRATCH_REVIEW_DIRECTORY
No new geometry, generation, decimation, downloads, or automatic publication.
Review the prepared modules before copying them to public/appearance.
"""
import json,struct,hashlib,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
destination=Path(sys.argv[1]).resolve()
for style in ['short','medium','long','tied','bun','braid']:
    source=root/'public/appearance'/style/f'Hair_{style}_LOD0.glb'
    data=source.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);binary=data[20+length:]
    record=json.loads(source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'))
    source_hash=hashlib.sha256(data).hexdigest();assert source_hash==record['outputSha256']
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for mesh in doc['meshes'] for p in mesh['primitives'])
    assert 100<triangles<10000,'Unexpected reference hair budget'
    for key in ['nodes','meshes']:
        for item in doc.get(key,[]):
            if 'name' in item:item['name']=item['name'].replace('LOD0','LOD2')
    text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
    output=struct.pack('<III',0x46546c67,2,20+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+binary
    folder=destination/style;folder.mkdir(parents=True,exist_ok=True);target=folder/f'Hair_{style}_LOD2.glb'
    assert not target.exists(),'Use a new review directory'
    target.write_bytes(output)
    record['lod']=2;record['outputSha256']=hashlib.sha256(output).hexdigest()
    record['qualitySource']={'publishedLOD':0,'sha256':source_hash,'triangles':triangles,'reason':'Preserve the already generated reference surface at Character Lab viewing distances; no additional reduction'}
    record['reviewRequired']=True
    target.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    print(style,triangles,target)
