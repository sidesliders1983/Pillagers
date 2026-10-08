import {validateCharacters} from './characters/validation.mjs';
try{
    const result=await validateCharacters({assetsOnly:process.argv.includes('--assets-only')});
    console.log(`Character validation passed: ${result.assets} assets / ${result.files} GLBs${result.runtime?`, ${result.runtime.characters} Golden Characters, ${result.runtime.modules} equipped modules, Idle/Walk/Run + World`:''}.`);
}catch(error){console.error(`Character validation failed: ${error.message}`);process.exitCode=1;}
