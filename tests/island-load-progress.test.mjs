import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { IslandLoadStatus, loadPlan, lastIslandLoad, loadResourceId } = load('../src/fjord-play/IslandLoadStatus.ts');
const steps = Object.keys(loadPlan);

test('loading percentage follows completed work, never elapsed time or phase messages', () => {
    let time = 0;
    const status = new IslandLoadStatus('new', 32, () => time);
    const values = [status.percent];
    status.enter('geography', 'terrain');
    time = 60_000;
    assert.equal(status.percent, 0);
    status.generationComplete('terrain');
    values.push(status.percent);
    status.generationComplete('terrain'); // duplicate worker delivery cannot credit twice
    assert.equal(status.percent, 8);
    status.generationComplete('foundations'); // nested retries are measured, not percent units
    assert.equal(status.percent, 8);
    status.complete('geography');
    values.push(status.percent);
    status.complete('campaign');
    status.count('assets', 20, 20, 'models');
    assert.equal(status.percent, 52, 'unequal asset costs are not counted as equal percentages');
    status.complete('assets');
    status.complete('world');
    status.complete('wildlife');
    status.complete('characters');
    status.enter('compile', 'shader-compilation');
    time += 30_000;
    assert.equal(status.percent, 90);
    assert.match(status.snapshot().warning, /Still preparing graphics/);
    status.complete('compile');
    status.count('textures', 1, 3, 'textures', true);
    values.push(status.percent);
    status.count('textures', 3, 3, 'textures', true);
    status.complete('textures');
    status.complete('draws');
    assert.equal(status.percent, 99);
    assert.equal(status.outcome, 'preparing', 'a rendered frame is not playable handoff');
    status.playable();
    values.push(status.percent);
    assert.equal(status.percent, 100);
    assert.equal(status.snapshot().playableMs, 90_000);
    assert.deepEqual([...values].sort((a, b) => a - b), values);
});

test('a fixed GPU batch cannot expand its denominator after crediting completion', () => {
    const status = new IslandLoadStatus('resume', 32);
    status.count('textures', 1, 2, 'textures', true);
    assert.throws(() => status.count('textures', 1, 4, 'textures', true), /discover more work/);
    assert.throws(() => status.playable(), /not prepared/);
    assert.equal(status.percent, 1);
});

test('cancel, worker timeout, context loss and a fresh retry have distinct truthful records', () => {
    let time = 0;
    const cancelled = new IslandLoadStatus('restart', 32, () => time);
    cancelled.complete('campaign');
    const pending = cancelled.begin('texture-upload');
    time = 5;
    cancelled.stop('cancelled');
    for (const step of steps) cancelled.complete(step);
    cancelled.generationComplete('terrain');
    cancelled.count('draws', 5, 5, 'draw batches', true);
    cancelled.playable();
    time = 50_000;
    assert.equal(cancelled.snapshot().elapsedMs, 5);
    assert.equal(cancelled.percent, 2, 'late completions cannot advance an aborted attempt');
    assert.equal(pending.outcome, 'cancelled');
    const retry = new IslandLoadStatus('restart', 32, () => time);
    assert.notEqual(retry.attempt, cancelled.attempt);
    assert.equal(retry.percent, 0);
    retry.worker = 'waiting';
    retry.stop('failed', new Error('Island generation timed out. Please retry.'));
    assert.equal(retry.snapshot().error.kind, 'worker-timeout');
    assert.equal(retry.worker, 'failed');
    const context = new IslandLoadStatus('resume');
    context.stop('failed', new Error('Graphics were interrupted while preparing the island. Please retry.'));
    assert.equal(context.snapshot().error.kind, 'context-loss');
    assert.equal(lastIslandLoad().attempt, context.attempt);
});

test('bounded timeline preserves unfinished starts, units and resource failures without campaign history', () => {
    let time = 0;
    const status = new IslandLoadStatus('resume', 123, () => time);
    for (let index = 0; index < 500; index++) {
        const sample = status.begin('batch-' + index);
        time += 10;
        status.end(sample);
    }
    status.enter('assets', 'assets-fetch-decode');
    status.begin('assets-fetch-decode');
    time += 20_000;
    status.problem('asset-fallback', 'HTTP 404', 'https://username:secret@example.test/tree.glb?token=secret');
    const report = status.snapshot();
    assert.equal(report.timeline.length, 128);
    assert.equal(report.timeline.at(-1).durationMs, undefined);
    assert.equal(report.lastProgressAgeMs, 20_000);
    assert.match(report.warning, /No new preparation progress/);
    assert.equal(report.error.resource, '/tree.glb');
    assert.equal(loadResourceId('tree.glb?token=private'), '/tree.glb');
    assert.ok(JSON.stringify(report).length < 20_000);
    assert.doesNotMatch(JSON.stringify(report), /secret|residents|rival|chapters/);
    assert.equal(report.measurements.processMemory, 'unsupported');
});

test('all modes and skipped/cached preparation still reserve playable handoff', () => {
    for (const mode of ['new', 'resume', 'restart']) {
        const status = new IslandLoadStatus(mode);
        for (const step of steps.filter(step => step !== 'handoff')) status.complete(step);
        assert.equal(status.percent, 99);
        status.playable();
        assert.equal(status.snapshot().outcome, 'playable');
        assert.equal(status.percent, 100);
    }
});
