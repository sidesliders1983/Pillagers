"""Prepare original reference crops for the local image-to-3D pipeline. No redraws."""
import argparse,hashlib,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
from scipy.ndimage import binary_fill_holes,label
from scipy.spatial import ConvexHull

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tools/image-to-3dlab'))
from image_to_3dlab.matte import cut_out,model_file,LITE_MODEL

p=argparse.ArgumentParser();p.add_argument('reference',type=Path);p.add_argument('output',type=Path);p.add_argument('--styles',nargs='+');p.add_argument('--repair-only',action='store_true');args=p.parse_args()
assert model_file(LITE_MODEL).is_file(),'Installed BiRefNet-lite required; no model downloads allowed.'
image=Image.open(args.reference).convert('RGB');args.output.mkdir(parents=True,exist_ok=True)
assert image.size==(1280,960),image.size
boxes={'short':(34,30,232,316),'medium':(235,30,430,316),'long':(432,30,626,316),'tied':(628,30,824,316),'bun':(826,30,1040,316),'braid':(1025,30,1249,335)}
for style,box in boxes.items():
    if args.styles and style not in args.styles:continue
    folder=args.output/style;folder.mkdir(exist_ok=True)
    cropped=folder/'reference-crop.png';image.crop(box).save(cropped)
    if args.repair_only:cut,model=Image.open(folder/'reference.png').convert('RGBA'),LITE_MODEL
    else:cut,model=cut_out(Image.open(cropped))
    rgba=np.array(cut);original=np.array(Image.open(cropped).convert('RGB'))
    # Repair enclosed false-negative matte holes using the original pixels.
    # This preserves the face under the hair for the 3D reconstruction.
    solid=rgba[:,:,3]>8;filled=binary_fill_holes(solid);holes=filled&~solid
    rgba[holes,:3]=original[holes];rgba[holes,3]=255
    if style in ('long','bun'):
        # The matte can erase a forehead patch that reaches the outside edge.
        # Close only the convex faceless-head area using its existing silhouette.
        yy,xx=np.where(rgba[:,:,3]>8);h,w=solid.shape
        area=(yy>h*.20)&(yy<h*.62)&(xx>w*.30)
        points=np.column_stack((xx[area],yy[area]));hull=ConvexHull(points)
        mask=Image.new('L',(w,h));ImageDraw.Draw(mask).polygon([tuple(map(int,points[i])) for i in hull.vertices],fill=255)
        repair=(np.array(mask)>0)&(rgba[:,:,3]<250)
        rgba[repair,:3]=original[repair];rgba[repair,3]=255
    components,count=label(rgba[:,:,3]>8,structure=np.ones((3,3)))
    if count:
        sizes=np.bincount(components.ravel());sizes[0]=0
        rgba[components!=sizes.argmax(),3]=0 # exclude adjacent row thumbnails
    destination=folder/'reference.png';Image.fromarray(rgba).save(destination)
    record={'style':style,'reference':str(args.reference),'referenceSha256':hashlib.sha256(args.reference.read_bytes()).hexdigest(),'crop':box,'matte':model,'input':str(destination),'inputSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'redrawn':False}
    (folder/'reference.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    print('REFERENCE_READY',style,flush=True)
