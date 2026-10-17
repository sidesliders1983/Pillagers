import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadMeshyApiKey } from './meshy-api-client.mjs';
import { createMeshyMultiImageClient, MESHY_MULTI_IMAGE_SETTINGS } from './meshy-multi-image-client.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'output/meshy-outfit-pipeline/pass-009');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = relative => readFile(path.join(directory, relative));
const json = async (relative) => JSON.parse(await read(relative));
const write = async (relative, value, exclusive = false) => writeFile(path.join(directory, relative), JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w', flush: true });
const optional = async (relative) => {
    try {
        return await json(relative);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    }
};
async function verified(part) {
    const replacement = part === 'tunic-003';
    const manifestPath = replacement ? 'conversion-inputs-005.json' : 'conversion-inputs.json';
    const approvalPath = replacement ? 'image-approval-005.json' : 'image-approval.json';
    const reviewPath = replacement ? 'image-review-005' : 'image-review-002';
    const manifest = await json(manifestPath);
    const approval = await json(approvalPath);
    assert.equal(approval.decision, 'approved');
    assert.equal(approval.userMessage, replacement ? 'Akkoord, converteer de nieuwe tuniek' : 'Dit lijkt goed te passen, ga verder');
    assert.equal(approval.inputManifestSha256, hash(await read(manifestPath)));
    assert.equal(approval.reviewManifestSha256, hash(await read(reviewPath + '/review-manifest.json')));
    assert.equal(manifest.recipeSha256, hash(await read('source/authoring-a20-002.json')));
    assert.equal(manifest.records.length, replacement ? 4 : 12);
    for (const record of manifest.records) {
        assert.equal(hash(await read(record.path)), record.sha256);
        assert.equal(hash(await read(record.sourcePath)), record.sourceSha256);
    }
    return { manifest, approval, inputManifestSha256: approval.inputManifestSha256,
        approvalSha256: hash(await read(approvalPath)) };
}
export async function fishermanJob(action, part) {
    const verifiedInputs = await verified(part);
    const estimatedCredits = part === 'tunic-003' ? 30 : 90;
    const balancePath = part === 'tunic-003' ? 'balance-tunic-003.json' : 'balance.json';
    const apiKey = await loadMeshyApiKey({ workspaceRoot: process.env.PILLAGERS_MESHY_CREDENTIAL_WORKSPACE ?? root });
    if (action === 'balance') {
        let response;
        try {
            response = await fetch('https://api.meshy.ai/openapi/v1/balance', {
                headers: { Authorization: 'Bearer ' + apiKey }, redirect: 'error',
                signal: AbortSignal.timeout(30000)
            });
        }
        catch {
            throw new Error('Meshy balance request failed; credentials omitted.');
        }
        assert.ok(response.ok, 'Meshy balance returned HTTP ' + response.status);
        const value = await response.json();
        assert.ok(Number.isSafeInteger(value.balance));
        await write(balancePath, { observedAt: new Date().toISOString(), balance: value.balance,
            estimatedBatchCredits: estimatedCredits, pricing: 'https://docs.meshy.ai/en/api/pricing' });
        return { balance: value.balance, estimatedBatchCredits: estimatedCredits };
    }
    assert.ok(['tunic', 'tunic-002', 'tunic-003', 'trousers', 'shoe'].includes(part));
    const inputPart = part.startsWith('tunic-') ? 'tunic' : part;
    const ledger = 'meshy/' + part;
    const records = ['front', 'back', 'left', 'right'].map(view => {
        const record = verifiedInputs.manifest.records.find(record => record.part === inputPart && record.view === view);
        assert.ok(record);
        return record;
    });
    const images = await Promise.all(records.map(async (record) => ({ view: record.view, format: 'png', bytes: await read(record.path) })));
    const body = JSON.stringify({ ...MESHY_MULTI_IMAGE_SETTINGS,
        image_urls: images.map(image => 'data:image/png;base64,' + image.bytes.toString('base64')) });
    const requestSha256 = hash(body);
    const intent = await optional(ledger + '/intent.json');
    const receipt = await optional(ledger + '/task.json');
    if (intent) {
        assert.equal(intent.requestSha256, requestSha256);
        assert.equal(intent.inputManifestSha256, verifiedInputs.inputManifestSha256);
        assert.equal(intent.approvalSha256, verifiedInputs.approvalSha256);
        if (receipt)
            assert.equal(receipt.intentSha256, hash(await read(ledger + '/intent.json')));
    }
    else
        assert.equal(receipt, null);
    const api = createMeshyMultiImageClient({ apiKey });
    if (action === 'submit') {
        if (intent) {
            assert.ok(receipt, 'Outcome unknown: a paid task may exist. Automatic retry prohibited.');
            return { part, taskId: receipt.taskId, submitted: false };
        }
        const balance = await json(balancePath);
        assert.ok(balance.balance >= estimatedCredits && Date.now() - Date.parse(balance.observedAt) < 600000, 'A recent balance sufficient for the approved conversion is required.');
        await mkdir(path.join(directory, ledger), { recursive: true });
        await write(ledger + '/intent.json', { part, submissionId: randomUUID(),
            createdAt: new Date().toISOString(), requestSha256,
            inputManifestSha256: verifiedInputs.inputManifestSha256,
            approvalSha256: verifiedInputs.approvalSha256,
            settings: MESHY_MULTI_IMAGE_SETTINGS, images: records }, true);
        const result = await api.create({ images });
        await write(ledger + '/task.json', { ...result,
            receivedAt: new Date().toISOString(), intentSha256: hash(await read(ledger + '/intent.json')) }, true);
        return { part, ...result, submitted: true };
    }
    assert.ok(intent && receipt, 'An acknowledged paid task is required.');
    if (action === 'poll') {
        const task = await api.status(receipt.taskId);
        await write(ledger + '/status.json', { observedAt: new Date().toISOString(), task });
        return { part, task };
    }
    assert.equal(action, 'download');
    const existing = await optional(ledger + '/download/provenance.json');
    if (existing) {
        assert.equal(existing.sha256, hash(await read(ledger + '/download/source.glb')));
        assert.equal(existing.taskId, receipt.taskId);
        return { part, downloaded: false, provenance: existing };
    }
    const result = await api.download(receipt.taskId);
    await mkdir(path.join(directory, ledger + '/download'), { recursive: true });
    try {
        await writeFile(path.join(directory, ledger, 'download/source.glb'), result.bytes, { flag: 'wx' });
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        assert.equal(hash(await read(ledger + '/download/source.glb')), hash(result.bytes));
    }
    const provenance = { part, taskId: receipt.taskId, sha256: hash(result.bytes),
        inputManifestSha256: verifiedInputs.inputManifestSha256,
        approvalSha256: verifiedInputs.approvalSha256,
        intentSha256: hash(await read(ledger + '/intent.json')),
        downloadedAt: new Date().toISOString(), ...result.validation };
    await write(ledger + '/download/provenance.json', provenance, true);
    return { part, downloaded: true, provenance };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    fishermanJob(...process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
