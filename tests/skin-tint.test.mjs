import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
import {Texture} from 'three';
const {tintSkinPixels,skinTexture}=load('../src/character-lab/SkinTint.ts');
test('skin blend visibly lifts red source, preserves clothing and retains shade differences',()=>{
    const pixels=new Uint8ClampedArray([205,70,45,255,160,45,30,255,230,220,195,255,0,0,0,255]);
    tintSkinPixels(pixels,'#e3c4a6');
    assert.equal(pixels[1],95);assert.equal(pixels[2],69);
    assert.ok(pixels[0]>pixels[4]);
    assert.deepEqual([...pixels.slice(8)],[230,220,195,255,0,0,0,255]);
    const darker=new Uint8ClampedArray([205,70,45,255]);tintSkinPixels(darker,'#bd9574');
    assert.ok(darker[0]<pixels[0]&&darker[1]<pixels[1]);
});

test('skin texture tint owns its image source and never progressively recolours cached albedo',()=>{
    const previous=globalThis.document;
    const image={width:1,height:1};
    globalThis.document={createElement(){const canvas={width:0,height:0,pixels:null};canvas.getContext=()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray([205,70,45,255])};},putImageData(data){canvas.pixels=[...data.data];}});return canvas;}};
    try{
        const source=new Texture(image),originalSource=source.source;
        const first=skinTexture(source,'#e3c4a6'),second=skinTexture(source,'#e3c4a6');
        assert.equal(source.source,originalSource);assert.equal(source.image,image);
        assert.notEqual(first.source,source.source);assert.notEqual(second.source,first.source);
        assert.deepEqual(first.image.pixels,second.image.pixels);
    }finally{globalThis.document=previous;}
});
