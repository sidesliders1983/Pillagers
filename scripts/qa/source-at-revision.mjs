import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
/** QA-only old-source loader: no checkout edits, no mutation of a stored blueprint. */
export function sourceAtRevision(revision) {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const native = createRequire(import.meta.url), cache = new Map();
    function load(url) {
        const key = url.href;
        if (cache.has(key)) return cache.get(key);
        const module = { exports: {} };
        cache.set(key, module.exports);
        const path = relative(root, fileURLToPath(url)).replaceAll('\\', '/');
        const text = execFileSync('git', ['show', revision + ':' + path], { cwd: root, encoding: 'utf8' });
        const compiled = ts.transpileModule(text, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        new Function('require', 'module', 'exports', compiled)(
            name => name.startsWith('.') ? load(new URL(name + '.ts', url)) : native(name), module, module.exports);
        return module.exports;
    }
    return load;
}
