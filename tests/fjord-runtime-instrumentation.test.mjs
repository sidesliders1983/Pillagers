import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual transform without starting Vite or requiring a historical Git checkout.
const server = readFileSync(new URL('../scripts/qa/fjord-runtime-server.mjs', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('fjord-runtime-server.mjs', server, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'instrument');
assert.ok(declaration);
const instrument = vm.runInNewContext('(' + declaration.getText(parsed) + ')', {
    ts, goldenMode: false, fogStudyMode: false, servedSource: { ref: 'fixture' },
});
const common = ['motion', 'layer', 'models', 'world', 'controller', 'camera', 'renderer', 'scene',
    'lighting', 'campfireEffect', 'precipitationEffect', 'selectionLabels', 'productionLabels',
    'refresh', 'setPlayback'];

for (const available of [[], ['discoveryFog'], ['discoveryFog', 'rivalScene']]) {
    test('QA bridge executes with scene bindings: ' + (available.join(', ') || 'legacy lighting only'), () => {
        const locals = [...common, ...available].map(name => name === 'renderer' ?
            'const renderer = { setAnimationLoop(callback) { callback(); } };' : 'let ' + name + ' = { name: "' + name + '" };');
        const source = 'export function init() {\n' + locals.join('\n') +
            '\n        renderer.setAnimationLoop(() => {});\n}';
        const compiled = ts.transpileModule(instrument(source), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        let bound;
        const spans = [];
        const audit = {
            bind(references) { bound = references; },
            enter(name) { spans.push('enter:' + name); return name; },
            leave(name) { spans.push('leave:' + name); },
        };
        const module = { exports: {} };
        vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
            assert.equal(name, '/scripts/qa/fjord-runtime-browser.mjs');
            return { audit };
        } }, { timeout: 1000 });
        module.exports.init.call({ session: {}, shared: {}, campaign: {} });
        for (const name of ['discoveryFog', 'rivalScene']) {
            assert.equal(Object.hasOwn(bound, name), available.includes(name));
            if (available.includes(name)) assert.equal(bound[name].name, name);
        }
        assert.equal(bound.camera.name, 'camera');
        assert.deepEqual(spans, ['enter:frame.callback', 'leave:frame.callback']);
    });
}
