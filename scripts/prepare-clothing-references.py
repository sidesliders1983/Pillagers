"""Crop original outfit references; never redraw or synthesize their design."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

STYLES = ['long-dress','belted-dress','apron-dress','short-red-tunic',
          'shawl-dress','layered-workwear','cream-tunic','blue-tunic',
          'work-vest','overshirt','mantle-tunic','green-tunic']

def prepare(reference, output):
    image=Image.open(reference).convert('RGB')
    assert image.size==(1280,960), image.size
    output.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256(reference.read_bytes()).hexdigest()
    records=[]
    for index,style in enumerate(STYLES):
        column=index%6;row=index//6
        box=(20+column*210,20+row*490,214+column*210,319+row*490)
        folder=output/style;folder.mkdir(exist_ok=True)
        crop=folder/'reference-crop.png';image.crop(box).save(crop)
        record={'id':style,'reference':str(reference),'referenceSha256':digest,
                'crop':box,'inputSha256':hashlib.sha256(crop.read_bytes()).hexdigest(),
                'redrawn':False,'stage':'cropped','reviewRequired':True}
        (folder/'reference.provenance.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
        records.append(record)
    (output/'references.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    print('Prepared',len(records),'original clothing crops')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('reference',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();prepare(args.reference.resolve(),args.output.resolve())
