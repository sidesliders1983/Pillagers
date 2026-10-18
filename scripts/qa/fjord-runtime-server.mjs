import { createServer } from 'vite';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const goldenMode = process.env.QA_GOLDEN === '1';
const fogStudyMode = process.env.QA_FOG_STUDY === '1';
if (fogStudyMode && !goldenMode) throw Error('The fog study requires the frozen golden capture clock.');
const sourceRef = process.env.QA_SOURCE_REF;
if (sourceRef && !/^[a-f0-9]{40}$/.test(sourceRef)) throw Error('QA_SOURCE_REF requires an exact commit');
// A paired baseline serves these unchanged sources through the same QA bridge, not HMR state.
const pinnedFiles = sourceRef ? ['src/fjord-play/FjordPlay.ts', 'src/core/WorldLighting.ts',
    ...(process.env.QA_PIN_PRESENTATION === '1' ? ['src/config/FjordPresentation.ts'] : [])] : [];
const pinnedSources = new Map(pinnedFiles.map(path => [path,
    execFileSync('git', ['show', sourceRef + ':' + path], { encoding: 'utf8' })]));
const servedSource = { ref: sourceRef ?? null, overrides: Object.fromEntries([...pinnedSources]
    .map(([path, source]) => [path, createHash('sha256').update(source).digest('hex')])) };

// QA-only: normal Vite builds never load this transform or its browser bridge.
function instrument(source) {
    if (goldenMode) {
        const replaceOnce = (before, after) => {
            if (source.split(before).length !== 2) throw Error('Golden frame anchor changed: ' + before);
            source = source.replace(before, after);
        };
        replaceOnce('const elapsed = clock.getDelta(), delta = Math.min(elapsed, .1);',
            'const elapsed = golden.frozen ? 0 : clock.getDelta(), delta = Math.min(elapsed, .1);');
        replaceOnce('time += delta;', 'time = golden.frozen ? golden.time : time + delta;');
    }
    const file = ts.createSourceFile('FjordPlay.ts', source, ts.ScriptTarget.Latest, true);
    const edits = [];
    const observationReferences = new Set();
    function visit(node) {
        // Pinned lighting baselines can predate discovery or the living rival scene.
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
            ['discoveryFog', 'rivalScene'].includes(node.name.text))
            observationReferences.add(node.name.text);
        if (ts.isArrowFunction(node) && ts.isBlock(node.body) && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
            const parent = node.parent;
            let name;
            if (ts.isVariableDeclaration(parent)) name = { refresh: 'ui.refresh', tickClock: 'clock.callback' }[parent.name.getText(file)];
            if (ts.isBinaryExpression(parent) && parent.left.getText(file) === 'syncScene') name = 'scene.syncPrefix';
            if (ts.isCallExpression(parent) && parent.expression.getText(file) === 'renderer.setAnimationLoop') name = 'frame.callback';
            if (name) {
                // Insert the suffix first when an empty body gives both edits the same offset.
                edits.push({ position: node.body.end - 1, text: '} finally { audit.leave(__auditSpan); }' });
                edits.push({ position: node.body.getStart(file) + 1,
                    text: `${name === 'clock.callback' ? 'if (audit.flags.manualClock) return;' : ''} const __auditSpan = audit.enter('${name}'); try {` });
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
            ${[...observationReferences].map(name => name + ',').join(' ')}
            campfireEffect, precipitationEffect, selectionLabels, productionLabels, refresh, setPlayback,
            settle: async () => { await actionWork; await sceneWork; },
            advanceTicks: async ticks => {
                action(() => this.session.command({ type: 'AdvanceTicks', ticks }));
                await actionWork;
                await sceneWork;
            } });
${goldenMode ? '        golden.bind(audit);' : ''}
${fogStudyMode ? '        fogStudy.bind(audit);' : ''}
` + anchor);
    return "import { audit } from '/scripts/qa/fjord-runtime-browser.mjs';\n" +
        'audit.servedSource = ' + JSON.stringify(servedSource) + ';\n' +
        (goldenMode ? "import { golden } from '/scripts/qa/fjord-golden-browser.mjs';\naudit.flags.manualClock = true;\n" : '') +
        (fogStudyMode ? "import { fogStudy } from '/scripts/qa/fjord-fog-study.mjs';\n" : '') + source;
}
const server = await createServer({
    cacheDir: process.env.QA_CACHE_DIR || 'artifacts/fjord-runtime-vite-cache',
    server: { host: '127.0.0.1', port: Number(process.env.QA_PORT || 5190), strictPort: true,
        watch: goldenMode ? null : undefined },
    plugins: [{ name: 'fjord-runtime-audit-only', enforce: 'pre', transform(source, id) {
        const path = id.replaceAll('\\', '/').split('?')[0];
        const pinned = [...pinnedSources.keys()].find(file => path.endsWith('/' + file));
        if (pinned) source = pinnedSources.get(pinned);
        if (path.endsWith('/src/fjord-play/FjordPlay.ts')) return { code: instrument(source), map: null };
        if (pinned) return { code: source, map: null };
    } }],
});
await server.listen();
server.printUrls();
