import { createServer } from 'vite';
import ts from 'typescript';

// QA-only: normal Vite builds never load this transform or its browser bridge.
function instrument(source) {
    const file = ts.createSourceFile('FjordPlay.ts', source, ts.ScriptTarget.Latest, true);
    const edits = [];
    function visit(node) {
        if (ts.isArrowFunction(node) && ts.isBlock(node.body) && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
            const parent = node.parent;
            let name;
            if (ts.isVariableDeclaration(parent)) name = { refresh: 'ui.refresh', tickClock: 'clock.callback' }[parent.name.getText(file)];
            if (ts.isBinaryExpression(parent) && parent.left.getText(file) === 'syncScene') name = 'scene.syncPrefix';
            if (ts.isCallExpression(parent) && parent.expression.getText(file) === 'renderer.setAnimationLoop') name = 'frame.callback';
            if (name) {
                edits.push({ position: node.body.getStart(file) + 1,
                    text: `const __auditSpan = audit.enter('${name}'); try {` });
                edits.push({ position: node.body.end - 1, text: '} finally { audit.leave(__auditSpan); }' });
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    for (const edit of edits.sort((a, b) => b.position - a.position))
        source = source.slice(0, edit.position) + edit.text + source.slice(edit.position);
    source = source.replace('if (performance.now() - lastDiagnostics > 500) {',
        "if (!audit.flags.diagnostics && performance.now() - lastDiagnostics > 500) { const __diagnostics = audit.enter('frame.diagnostics');");
    source = source.replace('lastDiagnostics = performance.now();', 'lastDiagnostics = performance.now(); audit.leave(__diagnostics);');
    source = source.replace('sceneWork = (async () => {', 'const __syncStart = performance.now(); sceneWork = (async () => {');
    source = source.replace('sceneWork = undefined;', "sceneWork = undefined; if (audit.active) audit.record('scene.syncAsyncWall', performance.now() - __syncStart);");
    const anchor = '        renderer.setAnimationLoop(() => {';
    if (source.split(anchor).length !== 2) throw Error('Audit frame binding anchor changed');
    source = source.replace(anchor,
        `        audit.bind({ session: this.session, shared: this.shared, campaign: this.campaign,
            motion, layer, models, world, controller, camera, renderer, scene, lighting,
            campfireEffect, precipitationEffect, selectionLabels, productionLabels, refresh, setPlayback });
` + anchor);
    return "import { audit } from '/scripts/qa/fjord-runtime-browser.mjs';\n" + source;
}
const server = await createServer({
    server: { host: '127.0.0.1', port: Number(process.env.QA_PORT || 5190), strictPort: true },
    plugins: [{ name: 'fjord-runtime-audit-only', enforce: 'pre', transform(source, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/fjord-play/FjordPlay.ts')) return { code: instrument(source), map: null };
    } }],
});
await server.listen();
server.printUrls();
