import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('sound controls require explicit activation and keep unavailable audio outside campaign saves', async () => {
    const dom = new JSDOM('<main></main>', { url: 'http://lan.invalid/fjord-play?audioProof=1' });
    const names = ['window', 'document', 'HTMLElement', 'AbortController'];
    const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of names) Object.defineProperty(globalThis, name,
        { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
    let controls;
    try {
        const { FjordAudio } = loadDOMSource('../src/audio/FjordAudio.ts');
        const { AudioControls } = loadDOMSource('../src/audio/AudioControls.ts');
        let attempts = 0;
        const audio = new FjordAudio({ storage: dom.window.localStorage,
            createContext: () => { attempts++; throw new Error('Web Audio unavailable'); } });
        controls = new AudioControls(audio, true);
        document.querySelector('main').append(controls.root);
        assert.equal(attempts, 0);
        assert.match(controls.root.textContent, /Synthetic audio proof/);
        controls.root.querySelector('button').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(attempts, 1);
        assert.match(controls.root.querySelector('[role="status"]').textContent, /unavailable/i);
        const master = controls.root.querySelector('input[data-volume="master"]');
        master.value = '.25';
        master.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        assert.equal(audio.settings.master, .25);
        assert.equal(dom.window.localStorage.length, 1);
        assert.equal(JSON.parse(dom.window.localStorage.getItem('fjordside.audio.v1')).master, .25);
        assert.equal(controls.root.querySelectorAll('input[type="range"]').length, 4);
    } finally {
        controls?.dispose();
        dom.window.close();
        for (const name of names) {
            if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
            else delete globalThis[name];
        }
    }
});


test('ordinary sound settings describe the installed mix and still wait for explicit activation', () => {
    const dom = new JSDOM('<main></main>', { url: 'http://game.invalid/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'AbortController'];
    const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of names) Object.defineProperty(globalThis, name,
        { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
    let controls;
    try {
        const { FjordAudio } = loadDOMSource('../src/audio/FjordAudio.ts');
        const { AudioControls } = loadDOMSource('../src/audio/AudioControls.ts');
        let attempts = 0;
        const audio = new FjordAudio({ createContext: () => { attempts++; throw new Error('Not activated'); } });
        controls = new AudioControls(audio, false);
        assert.equal(attempts, 0);
        assert.doesNotMatch(controls.root.textContent, /No approved sound pack/);
        assert.match(controls.root.textContent, /nearby activity/);
        assert.equal(controls.root.querySelector('[role="status"]').textContent, 'Sound off.');
    } finally {
        controls?.dispose();
        dom.window.close();
        for (const name of names) {
            if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
            else delete globalThis[name];
        }
    }
});

test('saved sound intent unlocks on ordinary start/control gestures and survives moving the settings into the game', async () => {
    const dom = new JSDOM('<section id="campaign-start"><button id="continue">Continue</button></section><main id="fjord-play"><button id="clock">Start</button></main>',
        { url: 'http://game.invalid/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    let controls;
    try {
        const { FjordAudio } = loadDOMSource('../src/audio/FjordAudio.ts');
        const { AudioControls } = loadDOMSource('../src/audio/AudioControls.ts');
        const parameter = () => ({ cancelScheduledValues() {}, setTargetAtTime() {} });
        const gain = () => ({ gain: parameter(), connect() {}, disconnect() {} });
        let contexts = 0, resumes = 0;
        const context = { state: 'suspended', currentTime: 0, destination: gain(), createGain: gain,
            addEventListener() {}, async resume() { resumes++; this.state = 'running'; },
            async suspend() { this.state = 'suspended'; }, async close() { this.state = 'closed'; } };
        dom.window.localStorage.setItem('fjordside.audio.v1', JSON.stringify({ muted: false, master: .7 }));
        const audio = new FjordAudio({ storage: dom.window.localStorage, createContext: () => { contexts++; return context; } });
        controls = new AudioControls(audio, false);
        document.querySelector('#campaign-start').append(controls.root);
        assert.equal(contexts, 0, 'Persisted preference alone cannot bypass the browser gesture');
        document.querySelector('#continue').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(audio.enabled, true);
        assert.equal(context.state, 'running');
        assert.equal(audio.settings.master, .7);
        document.querySelector('#fjord-play').append(controls.root);
        context.state = 'suspended';
        document.querySelector('#clock').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(context.state, 'running');
        assert.equal(contexts, 1);
        audio.configure({ muted: true });
        const before = resumes;
        document.querySelector('#clock').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resumes, before, 'A deliberate mute stays muted');
    } finally { controls?.dispose(); dom.window.close(); Object.assign(globalThis, previous); }
});
