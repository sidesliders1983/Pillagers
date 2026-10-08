"""Arrange captured browser pixels without treating capture as visual approval."""
import argparse,json,math
from pathlib import Path
from collections import defaultdict
from PIL import Image,ImageDraw,ImageFont

p=argparse.ArgumentParser();p.add_argument('report');p.add_argument('--output');p.add_argument('--profiles-per-page',type=int,default=4);p.add_argument('--filter');args=p.parse_args()
report=json.loads(Path(args.report).read_text());out=Path(args.output or Path(args.report).parent/'sheets');out.mkdir(parents=True,exist_ok=True)
groups=defaultdict(list)
for check in report['checks']:
    if not args.filter or args.filter in check['id']:groups[(check['id'],check['lod'],check['ratio'],check['clip'])].append(check)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
for (asset,lod,ratio,clip),checks in groups.items():
    profiles=list(dict.fromkeys(c['profile'] for c in checks));columns=list(dict.fromkeys((c['phase'],c['angle']) for c in checks))
    # Split both rows and columns; every panel remains readable at native pixels.
    for page in range(math.ceil(len(profiles)/args.profiles_per_page)):
        selected=profiles[page*args.profiles_per_page:(page+1)*args.profiles_per_page]
        for cp in range(math.ceil(len(columns)/4)):
            cols=columns[cp*4:(cp+1)*4];width=320*len(cols);height=390*len(selected)+40
            sheet=Image.new('RGB',(width,height),'#eaf0e4');draw=ImageDraw.Draw(sheet)
            draw.text((10,10),f'{asset} | body LOD{lod} | ratio {ratio} | {clip} | page {page+1} / panel {cp+1}',font=font,fill='#314531')
            for row,profile in enumerate(selected):
                for col,(phase,angle) in enumerate(cols):
                    check=next(c for c in checks if c['profile']==profile and c['phase']==phase and c['angle']==angle)
                    image=Image.open(check['screenshot']).convert('RGB');image.thumbnail((320,360),Image.Resampling.LANCZOS)
                    x,y=col*320,row*390+40;sheet.paste(image,(x,y));draw.text((x+6,y+362),f"{profile.replace('golden_','').replace('_01','')} {angle} {phase}",font=font,fill='#314531')
            sheet.save(out/f'{asset.replace("/","-")}-LOD{lod}-ratio{ratio}-{clip}-p{page+1}-c{cp+1}.jpg',quality=94)
print(json.dumps({'sheets':len(list(out.glob('*.jpg'))),'output':str(out),'approval':'requires human visual inspection'}))
