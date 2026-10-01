import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {characterAppearance,hairStyles,beardStyles}=load('../src/characters/CharacterAppearance.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {generatePhenotype}=load('../src/characters/generatePhenotype.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');

test('automatic appearance is deterministic; all hair styles remain eligible for both sexes; beards start at 18 for males',()=>{
    const observed={male:new Set(),female:new Set()},beards=new Set();
    for(let seed=0;seed<500;seed++)for(const sex of ['male','female']){
        const dna={...defaultDNA(),seed,sex,age:35};const p=characterAppearance(dna);
        assert.deepEqual(p,characterAppearance(JSON.parse(JSON.stringify(dna))));observed[sex].add(p.hairStyle);beards.add(p.beardStyle);
        assert.equal(p.color,generatePhenotype(dna).hairColor);
        if(sex==='female')assert.equal(p.beardStyle,'none');
        assert.equal(characterAppearance({...dna,age:17}).beardStyle,'none');
        if(sex==='male'&&p.beardStyle!=='none')assert.notEqual(characterAppearance({...dna,age:18}).beardStyle,'none');
    }
    for(const seen of Object.values(observed))assert.deepEqual([...seen].sort(),[...hairStyles].sort());
    assert.deepEqual([...beards].sort(),[...beardStyles].sort());
});

test('hair palette identity survives style changes; every heritage greys monotonically after 45 to light elder grey',()=>{
    for(const heritage of ['scandinavian','angloSaxon','gaelic','finnic','sami','baltic'])for(let seed=0;seed<20;seed++){
        const dna={...defaultDNA(),seed,heritage:{[heritage]:1}};
        const young=characterAppearance({...dna,age:30});
        assert.equal(characterAppearance({...dna,age:45}).color,young.color);
        assert.equal(characterAppearance({...dna,sex:'female'}).color,young.color);
        assert.equal(characterAppearance({...dna,traits:{...dna.traits,agility:1}}).color,young.color);
        let last=0;for(const age of [45,46,55,70,85,100]){const p=characterAppearance({...dna,age});assert.ok(p.greyAmount>=last);last=p.greyAmount;}
        assert.equal(characterAppearance({...dna,age:85}).color,'#c2bcb3');
    }
});

test('child and teen proportions mature continuously on the shared rig and suppress adult secondary morphology',()=>{
    const dna={...defaultDNA(),morphology:{masculinity:0,height:1.44},traits:{...defaultDNA().traits,physicality:1,agility:1}};
    const child=universalHumanProfile({...dna,age:6}),teen=universalHumanProfile({...dna,age:14}),adult=universalHumanProfile({...dna,age:18}),elder=universalHumanProfile({...dna,age:90});
    assert.equal(child.weights.Child,1);assert.ok(teen.weights.Child>0&&teen.weights.Child<1);assert.equal(adult.weights.Child,0);
    assert.equal(child.weights.Breasts,0);assert.ok(teen.weights.Breasts<adult.weights.Breasts);
    assert.ok(child.weights.Powerful<adult.weights.Powerful);assert.ok(child.motion.stride<adult.motion.stride);
    assert.ok(child.motion.cadence>adult.motion.cadence);assert.ok(elder.motion.cadence<adult.motion.cadence);
    assert.ok(child.weights.ChildPower>0&&child.weights.ChildAgility>0&&adult.weights.FemininePower>0);
});


test('appearance fit round-trips without changing profile style, colour or anatomy',()=>{
    const {parseCharacterDNA,cloneDNA}=load('../src/characters/CharacterDNA.ts');
    const original=defaultDNA(),fit={hair:1.3,beard:.75,clothing:1.3};
    const dna=parseCharacterDNA({...original,appearanceFit:fit});
    assert.deepEqual(parseCharacterDNA(JSON.parse(JSON.stringify(dna))).appearanceFit,fit);
    assert.deepEqual(characterAppearance(dna),characterAppearance(original));
    assert.deepEqual(universalHumanProfile(dna).weights,universalHumanProfile(original).weights);
    const cloned=cloneDNA(dna);cloned.appearanceFit.hair=1;assert.equal(dna.appearanceFit.hair,1.3);
    for(const invalid of [{...fit,hair:.99},{...fit,beard:NaN},{...fit,clothing:1.31}])assert.throws(()=>parseCharacterDNA({...original,appearanceFit:invalid}));
    assert.deepEqual(universalHumanProfile(original).appearanceFit,{hair:1,beard:1,clothing:1});
});


test('hair clearance offsets every style outward without scaling module transforms',async()=>{
    const {Vector3}=await import('three');
    const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
    const size=new Vector3(.24,.32,.26),delta=.24*.5*.3;
    for(const hairStyle of hairStyles)for(const lod of [0,1,2]){
        const profile={...characterAppearance(defaultDNA()),hairStyle,beardStyle:'none'};
        const base=appearanceModules(profile,size,lod),spaced=appearanceModules(profile,size,lod,{hair:1.3,beard:1,clothing:1});
        assert.equal(base.children.length,spaced.children.length);
        for(let m=0;m<base.children.length;m++){
            const a=base.children[m],b=spaced.children[m];
            assert.deepEqual(a.position,b.position);assert.deepEqual(a.scale,b.scale);
            const p=a.geometry.attributes.position,q=b.geometry.attributes.position;
            for(let i=0;i<p.count;i++){
                const original=new Vector3().fromBufferAttribute(p,i).multiply(a.scale).add(a.position);
                const moved=new Vector3().fromBufferAttribute(q,i).multiply(b.scale).add(b.position);
                assert.ok(Math.abs(original.distanceTo(moved)-delta)<1e-7,`${hairStyle} LOD${lod} clearance`);
                assert.ok(moved.length()>original.length());
            }
        }
        disposeModules(base);disposeModules(spaced);
    }
});
