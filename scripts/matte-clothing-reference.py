import hashlib,json,sys
from pathlib import Path
from PIL import Image
import numpy as np
from scipy.ndimage import label,binary_fill_holes
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'tools/image-to-3dlab'))
from image_to_3dlab.matte import cut_out,model_file,LITE_MODEL
assert model_file(LITE_MODEL).is_file(),'Installed matte weights required; no downloads'
source=Path(sys.argv[1]);output=Path(sys.argv[2])
image,model=cut_out(Image.open(source))
pixels=np.array(image.convert('RGBA'));original=np.array(Image.open(source).convert('RGB'))
components,count=label(pixels[:,:,3]>8,structure=np.ones((3,3)))
if count:
    sizes=np.bincount(components.ravel());sizes[0]=0
    main=components==sizes.argmax();filled=binary_fill_holes(main)
    pixels[~filled,3]=0;pixels[filled&~main,:3]=original[filled&~main];pixels[filled&~main,3]=255
Image.fromarray(pixels).save(output)
output.with_suffix('.matte.json').write_text(json.dumps({'model':model,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'inputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'redrawn':False},indent=2)+'\n',encoding='utf-8')
