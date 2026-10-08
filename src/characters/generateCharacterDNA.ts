import { CharacterDNA, characterDNAVersion, CoreTraits, HeritageMix, heritageKeys, normalizeHeritage, traitKeys } from './CharacterDNA';
import { seededRandom } from './seededRandom';
export function generateCharacterDNA(seed:number):CharacterDNA {
    const random=seededRandom(seed,'lab-randomize');
    return {schemaVersion:characterDNAVersion,seed,sex:random()<.5?'male':'female',age:18+Math.floor(random()*63),
        traits:Object.fromEntries(traitKeys.map(key=>[key,Math.round(random()*100)/100])) as CoreTraits,
        heritage:normalizeHeritage(Object.fromEntries(heritageKeys.map(key=>[key,.05+random()])) as HeritageMix)};
}
