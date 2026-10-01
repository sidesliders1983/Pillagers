import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {tintSkinPixels}=load('../src/character-lab/SkinTint.ts');
test('skin blend visibly lifts red source, preserves clothing and retains shade differences',()=>{
    const pixels=new Uint8ClampedArray([205,70,45,255,160,45,30,255,230,220,195,255,0,0,0,255]);
    tintSkinPixels(pixels,'#e3c4a6');
    assert.ok(pixels[1]>110);assert.ok(pixels[2]>85);
    assert.ok(pixels[0]>pixels[4]);
    assert.deepEqual([...pixels.slice(8)],[230,220,195,255,0,0,0,255]);
    const darker=new Uint8ClampedArray([205,70,45,255]);tintSkinPixels(darker,'#bd9574');
    assert.ok(darker[0]<pixels[0]&&darker[1]<pixels[1]);
});
