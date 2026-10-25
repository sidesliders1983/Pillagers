import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { CampaignPlayback } = load('../src/fjord-play/CampaignPlayback.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');

test('new, same-founders restart and ordinary Continue consume no time until a deliberate playable Play', () => {
    for (const entry of ['new', 'restart', 'continue', 'import']) {
        let owner = new SharedSettlement(newFjordScenario(32));
        owner.session.setMinutesPerWinter(5);
        if (entry === 'restart') owner.restart(true);
        if (entry === 'continue') {
            owner.session.setRunning(true);
            owner = SharedSettlement.restore(owner.persist(), 'fjord');
        }
        if (entry === 'import') owner.importJSON(owner.fjord.exportJSON());
        const before = owner.session.saveJSON();
        const speed = owner.session.minutesPerWinter;
        let eligible = false;
        const clock = new CampaignPlayback(running => owner.session.setRunning(running), () => eligible);
        const complete = clock.pendingHandoff(false);
        clock.play(); // A stale click while loading is ignored, not queued.
        owner.session.elapse(30000);
        clock.loaded(); complete();
        assert.equal(owner.session.running, false, entry);
        assert.equal(clock.canStep, false);
        eligible = true;
        complete(); owner.session.elapse(30000);
        assert.equal(owner.session.saveJSON(), before, entry);
        assert.equal(owner.session.minutesPerWinter, speed);
        clock.play();
        assert.equal(owner.session.running, true);
        assert.equal(clock.canStep, true);
        owner.session.elapse(1000);
        assert.notEqual(owner.session.saveJSON(), before);
        clock.reset(); clock.loaded();
        owner.session.elapse(30000);
        assert.equal(owner.session.running, false, 'In-game New/Restart/import reset the same gate');
        assert.equal(clock.canStep, false);
    }
});

test('story, invitation, slow scene work and warm recovery cannot queue playback or first-year advancement', () => {
    const owner = new SharedSettlement(newFjordScenario(17));
    let eligible = true;
    const clock = new CampaignPlayback(running => owner.session.setRunning(running), () => eligible);
    const canonical = owner.session.saveJSON();
    for (const gate of ['story', 'invitation', 'slow models', 'hidden tab', 'BFCache', 'WebGL loss']) {
        eligible = false;
        clock.pause();
        clock.loaded();
        clock.play();
        assert.equal(clock.canStep, false, gate);
        owner.session.elapse(60000);
        eligible = true;
        owner.session.elapse(60000);
        assert.equal(owner.session.running, false, gate);
        assert.equal(owner.session.saveJSON(), canonical);
    }
    clock.play(); clock.pause();
    assert.equal(owner.session.running, false);
    assert.equal(clock.canStep, true, 'An intentional +1 Year remains available after the first real Play');
});

test('intentional internal handoff preserves pacing only when no newer pause, loading or lifecycle intent supersedes it', () => {
    for (const interrupt of [false, true]) {
        const owner = new SharedSettlement(newFjordScenario(32));
        owner.session.restorePacing({ running: true, minutesPerWinter: 5, fractionalTicks: .25 });
        const canonical = owner.session.saveJSON();
        let eligible = true;
        const clock = new CampaignPlayback(running => owner.session.setRunning(running), () => eligible);
        const complete = clock.pendingHandoff(true);
        if (interrupt) { eligible = false; clock.pause(); eligible = true; }
        clock.loaded(); complete();
        assert.equal(owner.session.running, !interrupt);
        assert.equal(owner.session.minutesPerWinter, 5);
        assert.equal(owner.session.pacing().fractionalTicks, .25);
        assert.equal(owner.session.saveJSON(), canonical);
        clock.pause(); complete();
        assert.equal(owner.session.running, false, 'An old completion callback cannot resume again');
    }
});

test('a running campaign can always be paused during scene work, invalidating queued elapsed time', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    let eligible = true;
    const clock = new CampaignPlayback(running => owner.session.setRunning(running), () => eligible);
    clock.loaded(); clock.play();
    const canonical = owner.session.saveJSON(), intent = clock.intent;
    eligible = false; // A legitimate command is awaiting model/scene work.
    assert.equal(clock.canToggle(owner.session.running), true, 'Pause remains reachable while loading');
    clock.pause();
    assert.equal(clock.canToggle(owner.session.running), false, 'A fresh Play cannot be queued while loading');
    eligible = true;
    if (intent === clock.intent && owner.session.running) owner.session.elapse(1000);
    assert.equal(owner.session.running, false);
    assert.equal(owner.session.saveJSON(), canonical);
    clock.play();
    assert.equal(owner.session.running, true, 'A later deliberate Play is still ordinary gameplay');
});
