import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
/** Real UI controllers with styles omitted; jsdom supplies DOM semantics, not layout or WebGL. */
export function loadDOMSource(path) {
    const url = new URL(path, import.meta.url);
    return moduleAt(url);
}
function moduleAt(url) {
    if (url.pathname.endsWith('.json')) return JSON.parse(readFileSync(url, 'utf8'));
    if (cache.has(url.href)) return cache.get(url.href);
    const module = { exports: {} };
    cache.set(url.href, module.exports);
    const input = readFileSync(url, 'utf8').replace(/\bimport\.meta\.url\b/g, JSON.stringify(url.href));
    const source = ts.transpileModule(input, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const require = name => name.endsWith('.css') ? {} : name.startsWith('.') ?
        moduleAt(new URL(name.endsWith('.json') ? name : name + '.ts', url)) : nativeRequire(name);
    new Function('require', 'module', 'exports', source)(require, module, module.exports);
    return module.exports;
}
