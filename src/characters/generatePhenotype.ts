import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { Phenotype } from './Phenotype';
import { identitySample } from './seededRandom';
import { mixedProbabilities, weightedChoice, hairShades, eyeShades, skinShades } from './heritageProfiles';
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
function mixColor(a:string,b:string,t:number) {
    const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);
    return '#'+[16,8,0].map(shift=>Math.round(((x>>shift)&255)*(1-t)+((y>>shift)&255)*t).toString(16).padStart(2,'0')).join('');
}
export function generatePhenotype(input: CharacterDNA): Phenotype {
    const dna = parseCharacterDNA(input), t = dna.traits;
    const sample = (field:string) => identitySample(dna.seed,field);
    const maturity = clamp(dna.age / 20), growth = .42 + .58*Math.sqrt(maturity);
    const aging = clamp((dna.age-40)/60), mobilityAge = 1-.36*clamp((dna.age-35)/65);
    // Shared trait equations for both sexes; stature distributions substantially overlap.
    const height = (1.54 + sample('height')*.3 + (dna.sex==='male' ? .055 : 0)) * growth;
    const mass = clamp(.26 + t.physicality*.62 - t.agility*.16 + (sample('build')-.5)*.07,.12,.95);
    const shoulderWidth = height*(.2 + t.physicality*.105 - t.agility*.024)*(1+(sample('shoulders')-.5)*.1);
    const hair = hairShades[weightedChoice(mixedProbabilities(dna.heritage,'hair'),sample('hair-shade'))];
    return {
        height, shoulderWidth, hipWidth: height*(.17+mass*.07+(dna.sex==='female'?.009:0)), torsoMass: mass,
        torsoDepth: height*(.09+mass*.095), armThickness: height*(.031+t.physicality*.033-t.agility*.007),
        legThickness: height*(.044+t.physicality*.029-t.agility*.009),
        legRatio: .42+t.agility*.045+(sample('leg-ratio')-.5)*.035,
        armRatio: .31+t.agility*.023+(sample('arm-ratio')-.5)*.026,
        // Facial microvariation is independent of intelligence, cunning and temperament.
        headWidth: (.19+sample('head-width')*.035)*(.72+.28*maturity),
        headHeight: (.235+sample('head-height')*.028)*(.75+.25*maturity),
        jawWidth: (.13+sample('jaw-width')*.055)*(.72+.28*maturity),
        noseLength: (.038+sample('nose')*.035)*(.65+.35*maturity),
        cheekboneHeight: .5+sample('cheekbones')*.16,
        eyeSpacing: (.067+sample('eyes-spacing')*.019)*(.72+.28*maturity),
        earSize: (.026+sample('ears')*.012)*(.75+.25*maturity), asymmetry: (sample('asymmetry')-.5)*.008,
        hairColor: mixColor(hair,'#c2bcb3',clamp((dna.age-45)/40)),
        eyeColor: eyeShades[weightedChoice(mixedProbabilities(dna.heritage,'eyes'),sample('eye-shade'))],
        skinTone: skinShades[weightedChoice(mixedProbabilities(dna.heritage,'skin'),sample('skin-shade'))],
        hairline: .12+sample('hairline')*.3+aging*.08,
        beardCoverage: dna.sex==='male'&&dna.age>=18&&sample('beard-presence')>.35 ? .25+sample('beard-coverage')*.65 : 0,
        postureStrength: clamp(.25+t.physicality*.65-aging*.12), postureLean: .025*(1-t.physicality)+aging*.045,
        movementWeight: clamp(.22+mass*.6-t.agility*.18), movementSpeed: (.65+t.agility*.75)*mobilityAge*(.65+.35*maturity),
        idleCadence: .6+t.agility*.65, poseTension: .15+t.temperament*.75,
        learningRate: .45+t.intelligence*.9, opportunism: .15+t.cunning*.75,
    };
}
