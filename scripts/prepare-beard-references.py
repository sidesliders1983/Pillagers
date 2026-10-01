"""Original bottom-row beard references, without redrawing."""
import hashlib,json,sys
from pathlib import Path
from PIL import Image
source=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve();output.mkdir(parents=True,exist_ok=True)
image=Image.open(source).convert('RGB');assert image.size==(1280,960)
records=[]
for column,style in enumerate(['stubble','short','medium','long','split-braid','braid']):
    box=(20+column*210,485,214+column*210,780 if style=='braid' else 752)
    folder=output/style;folder.mkdir(exist_ok=True);crop=folder/'reference-crop.png';image.crop(box).save(crop)
    record={'id':style,'reference':str(source),'referenceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'crop':box,'inputSha256':hashlib.sha256(crop.read_bytes()).hexdigest(),'redrawn':False,'reviewRequired':True}
    (folder/'reference.provenance.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');records.append(record)
(output/'references.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print('Prepared six original beard crops')
