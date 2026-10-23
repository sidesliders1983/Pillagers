import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('playtest measurements distinguish frame cadence, synchronous CPU and processed ticks', () => {
    const { PerformanceMeasurements } = load('../src/fjord-play/PerformanceMeasurements.ts');
    let now = 0;
    const measurements = new PerformanceMeasurements(() => now);
    measurements.setMode('Running');
    for (const time of [0, 10, 30, 60, 100]) {
        now = time;
        measurements.frame(time, 2);
    }
    measurements.span('core', 8, 3);
    now = 1000;
    const sample = measurements.sample();
    assert.equal(sample.interval.meanMs, 25);
    assert.equal(sample.interval.p50Ms, 20);
    assert.equal(sample.interval.p95Ms, 40);
    assert.equal(sample.interval.p99Ms, 40);
    assert.equal(sample.fps, 40);
    assert.equal(sample.cpuFrame.meanMs, 2);
    assert.equal(sample.spans.core.latestMs, 8);
    assert.equal(sample.ticks.total, 3);
    assert.equal(sample.ticks.perSecond, 3);
    assert.equal(sample.gpu.status, 'uninitialized');
    measurements.setMode('Background');
    now = 61_000;
    measurements.setMode('Paused');
    measurements.frame(now, 3);
    now += 20;
    measurements.frame(now, 4);
    const returned = measurements.sample();
    assert.equal(returned.interval.worstMs, 20, 'Hidden time is not a render hitch');
    assert.equal(returned.mode, 'Paused');
    assert.equal(returned.cpuFrame.meanMs, 3.5, 'Paused still performs render work');
});

test('a large recent hitch survives smaller gaps and bounded history until its sixty-second expiry', () => {
    const { PerformanceMeasurements } = load('../src/fjord-play/PerformanceMeasurements.ts');
    let now = 0;
    const samples = new PerformanceMeasurements(() => now);
    samples.setMode('Running');
    samples.mark('exception', 'Failed https://user:secret@example.invalid/file.glb?token=private');
    samples.frame(now, 2);
    now = 1000;
    samples.frame(now, 2);
    for (let index = 0; index < 100; index++) {
        now += 110;
        samples.frame(now, 2);
        samples.sample();
    }
    assert.equal(samples.sample().worstRecentHitchMs, 1000);
    assert.equal(samples.sample().latestError.message, 'Failed /file.glb');
    for (let index = 0; index < 1000; index++) { now += 500; samples.sample(); }
    const later = samples.sample();
    assert.equal(later.worstRecentHitchMs, 0);
    assert.ok(later.history.length <= 120);
    assert.ok(later.events.length <= 32);
    assert.equal(later.fps, null, 'Expired frame data is unknown, not zero FPS');
    samples.dispose();
    samples.frame(now + 20, 1);
    samples.mark('exception', 'Ignore after disposal');
    assert.equal(samples.sample().history.length, 0);
    assert.equal(samples.sample().events.length, 0);
});
