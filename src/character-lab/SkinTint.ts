import { BufferAttribute, Color, Float32BufferAttribute, InterleavedBufferAttribute, Source, Texture } from 'three';

/** Shared sRGB classifier/blend for source albedo pixels and linear vertex palettes. */
function blendedSkinRGB(r:number,g:number,b:number,target:readonly number[],strength:number):number[]|null {
    if(r<60||r<g*1.18||r<b*1.25)return null;
    // Preserve broad source light/dark facets while replacing the red hue.
    const shade=Math.max(.55,Math.min(1.12,r/205));
    return [r,g,b].map((channel,c)=>channel*(1-strength)+Math.min(255,target[c]*shade)*strength);
}
function skinTarget(skinTone:string){const color=new Color(skinTone).convertLinearToSRGB();return [color.r*255,color.g*255,color.b*255];}

/** Blend source skin pixels; white clothing and dark atlas padding stay intact. */
export function tintSkinPixels(pixels:Uint8ClampedArray,skinTone:string,strength=.2){
    const target=skinTarget(skinTone);
    for(let i=0;i<pixels.length;i+=4){
        const blended=blendedSkinRGB(pixels[i],pixels[i+1],pixels[i+2],target,strength);
        if(blended)for(let c=0;c<3;c++)pixels[i+c]=Math.round(blended[c]);
    }
}

/** Own a tinted linear RGB(A) palette; never alter cached COLOR_0 or non-skin values. */
export function tintSkinVertexColors(source:BufferAttribute|InterleavedBufferAttribute,skinTone:string,strength=.2):Float32BufferAttribute {
    if(source.itemSize!==3&&source.itemSize!==4)throw new Error('Skin vertex colours must contain RGB or RGBA values.');
    const target=skinTarget(skinTone),values=new Float32Array(source.count*source.itemSize),color=new Color();
    for(let vertex=0;vertex<source.count;vertex++){
        const offset=vertex*source.itemSize;
        for(let channel=0;channel<source.itemSize;channel++){
            const value=source.getComponent(vertex,channel);
            if(!Number.isFinite(value)||value<0||value>1)throw new Error('Skin vertex colours must be finite normalized linear RGB(A).');
            values[offset+channel]=value;
        }
        color.setRGB(values[offset],values[offset+1],values[offset+2]).convertLinearToSRGB();
        const blended=blendedSkinRGB(color.r*255,color.g*255,color.b*255,target,strength);
        if(!blended)continue; // Preserve exact original white/non-skin/alpha values.
        color.setRGB(blended[0]/255,blended[1]/255,blended[2]/255).convertSRGBToLinear();
        values[offset]=color.r;values[offset+1]=color.g;values[offset+2]=color.b;
    }
    const tinted=new Float32BufferAttribute(values,source.itemSize);tinted.needsUpdate=true;return tinted;
}

export function skinTexture(source:Texture,skinTone:string):Texture|null {
    if(typeof document==='undefined'||!source.image)return null;
    const image=source.image as HTMLImageElement;
    const canvas=document.createElement('canvas'),scale=Math.min(1,2048/Math.max(image.width,image.height));
    canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
    ctx.drawImage(image,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
    tintSkinPixels(data.data,skinTone);ctx.putImageData(data,0,0);
    const texture=source.clone();texture.source=new Source(canvas);texture.needsUpdate=true;
    return texture;
}
