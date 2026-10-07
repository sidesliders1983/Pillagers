import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),cache=new Map();
/** Load the same dependency-light TS contracts in Node tooling and tests. */
export function loadTypeScript(url){
    const key=new URL(url).href;if(cache.has(key))return cache.get(key);
    const module={exports:{}};cache.set(key,module.exports);
    const source=ts.transpileModule(readFileSync(new URL(key),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','module','exports',source)(name=>name.startsWith('.')?loadTypeScript(new URL(name+'.ts',key)):nativeRequire(name),module,module.exports);
    return module.exports;
}
