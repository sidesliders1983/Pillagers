import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {SoftBodySpring}=load('../src/character-lab/SoftBodySpring.ts');
test('soft body spring lags, settles and remains stable across frame rates and long pauses',()=>{
    const spring=new SoftBodySpring(55,9);
    const initial=spring.step(1/60,.6);assert.ok(initial>0&&initial<.6);
    for(let i=0;i<120;i++)spring.step(1/60,.6);
    assert.ok(Math.abs(spring.position-.6)<.001);
    for(let i=0;i<240;i++)spring.step(1/60,0);
    assert.ok(Math.abs(spring.position)<.0001);
    for(const fps of [15,30,60,120]){
        const s=new SoftBodySpring(55,9);
        for(let i=0;i<fps*5;i++)s.step(1/fps,Math.sin(i/fps*8)*.6);
        assert.ok(Number.isFinite(s.position)&&Math.abs(s.position)<.9);
        s.step(60,100);assert.ok(Math.abs(s.position)<=.9);
        s.reset();assert.equal(s.position,0);assert.equal(s.velocity,0);
    }
});
