import { Color, Texture } from 'three';

/** Blend source skin pixels; white clothing and dark atlas padding stay intact. */
export function tintSkinPixels(pixels:Uint8ClampedArray,skinTone:string,strength=.4){
    const color=new Color(skinTone).convertLinearToSRGB();
    const target=[color.r*255,color.g*255,color.b*255];
    for(let i=0;i<pixels.length;i+=4){
        const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        if(r<60||r<g*1.18||r<b*1.25)continue;
        // Preserve broad painted light/dark facets while replacing the red hue.
        const shade=Math.max(.55,Math.min(1.12,r/205));
        for(let c=0;c<3;c++)pixels[i+c]=Math.round(pixels[i+c]*(1-strength)+Math.min(255,target[c]*shade)*strength);
    }
}

export function skinTexture(source:Texture,skinTone:string):Texture|null {
    if(typeof document==='undefined'||!source.image)return null;
    const image=source.image as HTMLImageElement;
    const canvas=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(image.width,image.height));
    canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
    ctx.drawImage(image,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
    tintSkinPixels(data.data,skinTone);ctx.putImageData(data,0,0);
    const texture=source.clone();texture.image=canvas;texture.needsUpdate=true;
    return texture;
}
