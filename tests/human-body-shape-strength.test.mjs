import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {universalHumanProfile,humanMorphNames,humanBodyShapeStrength}=load('../src/characters/UniversalHumanProfile.ts');

// Golden profiles captured before the requested 40% build-volume reduction.
// These cover both weight directions, sex extremes, growth, elder posture,
// agility extremes, automatic height and appearance.
const fixtures=[{"name":"adult male heavy","dna":{"schemaVersion":1,"seed":1983,"sex":"male","age":32,"traits":{"physicality":0.55,"agility":1,"intelligence":0,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05},"morphology":{"masculinity":1,"height":1.6}},"before":{"seed":1983,"height":1.6,"adultAge":32,"masculinity":1,"weightDeviation":0.6596375132357934,"age":32,"stage":"adult","appearance":{"hairStyle":"short","beardStyle":"stubble","color":"#986e55","greyAmount":0},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":1.06,"stride":1,"footfall":1.03},"weights":{"Masculine":1,"Feminine":0,"Breasts":0,"Powerful":0,"Slight":0,"Agile":1,"Grounded":0,"Tall":0.6666666666666673,"Short":0,"Overweight":0.6596375132357934,"Underweight":0,"Age":0,"HeadWidth":0.10577098689973354,"HeadLength":0.2729848863556981,"Jaw":-0.06923875082284212,"Nose":0.138847781997174,"LegRatio":0.11302727169822901,"ShoulderSlope":-0.0403518982231617,"Asymmetry":0.07265879714395851,"BellyJiggle":0,"BreastJiggle":0,"Child":0,"ChildPower":0,"ChildAgility":0,"FemininePower":0,"MasculineAgility":1,"TallSlight":0,"ElderHeavy":0}}},{"name":"adult female grounded","dna":{"schemaVersion":1,"seed":0,"sex":"male","age":32,"traits":{"physicality":0.55,"agility":0,"intelligence":0,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05},"morphology":{"masculinity":0,"height":1.16}},"before":{"seed":0,"height":1.16,"adultAge":32,"masculinity":0,"weightDeviation":0.6900816943089012,"age":32,"stage":"adult","appearance":{"hairStyle":"braid","beardStyle":"none","color":"#786052","greyAmount":0},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":0.94,"stride":1,"footfall":1.03},"weights":{"Masculine":0,"Feminine":1,"Breasts":1,"Powerful":0,"Slight":0,"Agile":0,"Grounded":1,"Tall":0,"Short":1,"Overweight":0.6900816943089012,"Underweight":0,"Age":0,"HeadWidth":0.09843481695279478,"HeadLength":0.27721406891942024,"Jaw":0.17631241413764656,"Nose":-0.11808551251888275,"LegRatio":0.14512141863815486,"ShoulderSlope":-0.16909061139449477,"Asymmetry":0.02548941713757813,"BellyJiggle":0,"BreastJiggle":0,"Child":0,"ChildPower":0,"ChildAgility":0,"FemininePower":0,"MasculineAgility":0,"TallSlight":0,"ElderHeavy":0}}},{"name":"child male agile","dna":{"schemaVersion":1,"seed":2,"sex":"male","age":6,"traits":{"physicality":0.55,"agility":1,"intelligence":0.3,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05},"morphology":{"masculinity":1,"height":1.44}},"before":{"seed":2,"height":1.44,"adultAge":18,"masculinity":1,"weightDeviation":0.585174782956451,"age":6,"stage":"child","appearance":{"hairStyle":"bun","beardStyle":"none","color":"#986e55","greyAmount":0},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":1.272,"stride":0.44999999999999996,"footfall":0.5665000000000001},"weights":{"Masculine":0.15000000000000002,"Feminine":0,"Breasts":0,"Powerful":0,"Slight":0,"Agile":0.15000000000000002,"Grounded":0,"Tall":0,"Short":0,"Overweight":0.2925873914782255,"Underweight":0,"Age":0,"HeadWidth":0.17157043693587185,"HeadLength":-0.15133025175891815,"Jaw":0.0693598163779825,"Nose":0.2423591184429824,"LegRatio":0.1244359229458496,"ShoulderSlope":-0.1433377517387271,"Asymmetry":0.04175495139788836,"BellyJiggle":0,"BreastJiggle":0,"Child":1,"ChildPower":0,"ChildAgility":1,"FemininePower":0,"MasculineAgility":0.15000000000000002,"TallSlight":0,"ElderHeavy":0}}},{"name":"teen female thin","dna":{"schemaVersion":1,"seed":3,"sex":"male","age":12,"traits":{"physicality":0.55,"agility":1,"intelligence":0.5,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05},"morphology":{"masculinity":0,"height":1.44}},"before":{"seed":3,"height":1.44,"adultAge":18,"masculinity":0,"weightDeviation":-0.3058097915459875,"age":12,"stage":"child","appearance":{"hairStyle":"short","beardStyle":"none","color":"#986e55","greyAmount":0},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":1.1511600000000002,"stride":0.7635,"footfall":0.830695},"weights":{"Masculine":0,"Feminine":0.6345000000000001,"Breasts":0.3249000000000001,"Powerful":0,"Slight":0,"Agile":0.6345000000000001,"Grounded":0,"Tall":0,"Short":0,"Overweight":0,"Underweight":0.24006068636360017,"Age":0,"HeadWidth":-0.2864005561452359,"HeadLength":-0.10333831147290766,"Jaw":0.023601655522361396,"Nose":0.23385541881434618,"LegRatio":0.1320651463465765,"ShoulderSlope":0.07258561365306378,"Asymmetry":-0.17102708030724897,"BellyJiggle":0,"BreastJiggle":0,"Child":0.43,"ChildPower":0,"ChildAgility":0.43,"FemininePower":0,"MasculineAgility":0,"TallSlight":0,"ElderHeavy":0}}},{"name":"elder female heavy","dna":{"schemaVersion":1,"seed":1983,"sex":"male","age":75,"traits":{"physicality":0.55,"agility":1,"intelligence":0,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05},"morphology":{"masculinity":0,"height":1.6}},"before":{"seed":1983,"height":1.6,"adultAge":75,"masculinity":0,"weightDeviation":0.6596375132357934,"age":75,"stage":"elder","appearance":{"hairStyle":"long","beardStyle":"none","color":"#b8a99c","greyAmount":0.75},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":0.9275,"stride":0.85,"footfall":1.03},"weights":{"Masculine":0,"Feminine":1,"Breasts":1,"Powerful":0,"Slight":0,"Agile":1,"Grounded":0,"Tall":0.6666666666666673,"Short":0,"Overweight":0.6596375132357934,"Underweight":0,"Age":0.5,"HeadWidth":0.10577098689973354,"HeadLength":0.2729848863556981,"Jaw":-0.06923875082284212,"Nose":0.138847781997174,"LegRatio":0.11302727169822901,"ShoulderSlope":-0.0403518982231617,"Asymmetry":0.07265879714395851,"BellyJiggle":0,"BreastJiggle":0,"Child":0,"ChildPower":0,"ChildAgility":0,"FemininePower":0,"MasculineAgility":0,"TallSlight":0,"ElderHeavy":0.3298187566178967}}},{"name":"automatic height and appearance","dna":{"schemaVersion":1,"seed":1983,"sex":"male","age":32,"traits":{"physicality":0.55,"agility":0.55,"intelligence":0.55,"cunning":0.4,"temperament":0.4},"heritage":{"scandinavian":0.5,"angloSaxon":0.2,"gaelic":0.15,"finnic":0.05,"sami":0.05,"baltic":0.05}},"before":{"seed":1983,"height":1.5056687145773322,"adultAge":32,"masculinity":0.51,"weightDeviation":0.22446169564245202,"age":32,"stage":"adult","appearance":{"hairStyle":"medium","beardStyle":"stubble","color":"#986e55","greyAmount":0},"appearanceFit":{"hair":1,"beard":1,"clothing":1},"motion":{"cadence":1.006,"stride":1,"footfall":1.03},"weights":{"Masculine":0.020000000000000018,"Feminine":0,"Breasts":0,"Powerful":0,"Slight":0,"Agile":0.10000000000000009,"Grounded":0,"Tall":0.2736196440722177,"Short":0,"Overweight":0.22446169564245202,"Underweight":0,"Age":0,"HeadWidth":0.10577098689973354,"HeadLength":0.2729848863556981,"Jaw":-0.06923875082284212,"Nose":0.138847781997174,"LegRatio":0.11302727169822901,"ShoulderSlope":-0.0403518982231617,"Asymmetry":0.07265879714395851,"BellyJiggle":0,"BreastJiggle":0,"Child":0,"ChildPower":0,"ChildAgility":0,"FemininePower":0,"MasculineAgility":0.0020000000000000035,"TallSlight":0,"ElderHeavy":0}}}];
const reducedAxes=['Masculine','Feminine','Breasts','Powerful','Slight','Agile','Grounded','Overweight','Underweight','ChildPower','ChildAgility','FemininePower','MasculineAgility','TallSlight','ElderHeavy'];

test('all body-build axes retain exactly 60 percent of their previous visual strength',()=>{
    assert.equal(humanBodyShapeStrength,.6);
    const seen=new Set();
    for(const {name,dna,before} of fixtures){
        const after=universalHumanProfile(dna);
        for(const axis of reducedAxes){
            assert.equal(after.weights[axis],before.weights[axis]*.6,name+': '+axis);
            if(before.weights[axis]!==0)seen.add(axis);
        }
    }
    // The dormant Physicality axes remain zero; every active reduced axis is
    // exercised by at least one fixture rather than passing only because zero.
    assert.deepEqual([...seen].sort(),['Agile','Breasts','ChildAgility','ElderHeavy','Feminine','Grounded','Masculine','MasculineAgility','Overweight','Underweight'].sort());
});

test('compound morphs are reduced once after composition rather than multiplying reduced bases',()=>{
    const male=fixtures.find(row=>row.name==='adult male heavy');
    const child=fixtures.find(row=>row.name==='child male agile');
    const elder=fixtures.find(row=>row.name==='elder female heavy');
    assert.equal(universalHumanProfile(male.dna).weights.MasculineAgility,.6);
    assert.equal(universalHumanProfile(child.dna).weights.ChildAgility,.6);
    assert.equal(universalHumanProfile(elder.dna).weights.ElderHeavy,elder.before.weights.ElderHeavy*.6);
    for(const {dna} of fixtures){
        const {weights}=universalHumanProfile(dna);
        for(const name of ['Powerful','Slight','ChildPower','FemininePower','TallSlight'])assert.equal(weights[name],0,name);
    }
});

test('height, child growth, age posture, head and proportion axes retain their pre-change values',()=>{
    for(const {name,dna,before} of fixtures){
        const after=universalHumanProfile(dna);
        assert.deepEqual(Object.keys(after.weights),humanMorphNames,name);
        for(const axis of humanMorphNames.filter(axis=>!reducedAxes.includes(axis)))
            assert.equal(after.weights[axis],before.weights[axis],name+': '+axis);
    }
});

test('raw DNA, sex tendency, intelligence tendency, appearance and motion stay unchanged',()=>{
    for(const {name,dna,before} of fixtures){
        const inputBefore=structuredClone(dna),after=universalHumanProfile(dna);
        assert.deepEqual(dna,inputBefore,name+': raw DNA');
        const {weights:_beforeWeights,...oldIdentity}=before;
        const {weights:_afterWeights,...newIdentity}=after;
        assert.deepEqual(newIdentity,oldIdentity,name);
        assert.deepEqual(after,universalHumanProfile(structuredClone(dna)),name+': deterministic');
    }
});
