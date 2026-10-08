import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root=new URL('../',import.meta.url),nativeRequire=createRequire(import.meta.url);
export function createLoader(staged=true){
 const cache=new Map(),overrides=new Map(['src/characters/AttachmentContract.ts','src/characters/CharacterFitSystem.ts','src/character-lab/AppearanceModules.ts'].map(p=>[new URL(p,root).href,staged?new URL(p,root):new URL('fixtures/contact-baseline/'+p,import.meta.url)]));
 const load=url=>{
  const key=new URL(url).href;if(cache.has(key))return cache.get(key);
  const module={exports:{}};cache.set(key,module.exports);
  const source=fs.readFileSync(overrides.has(key)?overrides.get(key):new URL(key),'utf8');
  const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('TypeScript transpile error in '+key);
  new Function('require','module','exports',result.outputText)(name=>name.startsWith('.')?load(new URL(name+'.ts',key)):nativeRequire(name),module,module.exports);
  cache.set(key,module.exports);return module.exports;
 };
 return p=>load(new URL(p,root));
}
export const repoRoot=root;
