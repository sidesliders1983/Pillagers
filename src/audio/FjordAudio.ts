import { ForegroundTrack, type ForegroundAsset } from './ForegroundTrack';
import { Soundscape, soundGain, soundLimits, type SoundBus, type SoundCamera, type SoundEmitter,
    type SoundCue, type SoundPoint, type SoundVoice } from './Soundscape';

export interface SoundAsset {
    id: string;
    path?: string;
    /** Only the labelled QA proof uses self-authored synthesized buffers. */
    proof?: 'tone' | 'noise';
    seconds: number;
    channels: 1 | 2;
    frequency?: number;
}
export interface SoundManifest {
    cues: readonly SoundCue[];
    assets: readonly SoundAsset[];
    /** Optional admission budget for a small shared family, inside the existing global cache cap. */
    decodedBudget?: { assetIds: readonly string[]; maximumBytes: number };
}
export interface SoundPreferences {
    muted: boolean; master: number; ambience: number; world: number; interface: number;
}
type Voice = { source: AudioBufferSourceNode; gain: GainNode; panner?: PannerNode;
    cue: SoundCue; revision?: number; loop: boolean };
type World = { alive: boolean; sources: readonly SoundEmitter[]; last: number; plan: Soundscape;
    camera?: SoundCamera; paused: boolean; listener?: ReturnType<Soundscape['update']>['listener'] };
type PlaybackSession = { type: string };
const preferenceKey = 'fjordside.audio.v1';
const defaults: SoundPreferences = { muted: true, master: .5, ambience: .35, world: .55, interface: .35 };

/** Application-owned Web Audio context. Worlds own voices, never the context or campaign. */
export class FjordAudio {
    changed?: () => void;
    private context?: AudioContext;
    private foregroundTrack?: ForegroundTrack;
    private foregroundDucking = false;
    private createMedia: () => HTMLAudioElement;
    private playbackSession?: { session: PlaybackSession; previous: string };
    private master?: GainNode;
    private buses = new Map<SoundBus, GainNode>();
    private voices = new Map<string, Voice>();
    private retiring = new Set<Voice>();
    private pending = new Map<string, object>();
    private inflightClients = 0;
    private buffers = new Map<string, AudioBuffer>();
    private loading = new Map<string, Promise<AudioBuffer>>();
    private failed = new Set<string>();
    private fetch: typeof fetch;
    private base: string;
    private downloads = new AbortController();
    private current?: World;
    private hidden = false;
    private consent = false;
    private gestureActivation?: Promise<boolean>;
    private disposed = false;
    private failure = '';
    private highVoices = 0;
    private highPhysical = 0;
    private downloadBytes = 0;
    private selectionMs: number[] = [];
    private decodeWallMs: number[] = [];
    private decodeCallMs: number[] = [];
    private starts = new Map<string, number>();
    private requestedCues = new Map<string, number>();
    private preferences = { ...defaults };
    private createContext: () => AudioContext;
    private now: () => number;
    private storage?: Pick<Storage, 'getItem' | 'setItem'>;
    constructor(options: { createContext?: () => AudioContext; now?: () => number;
        storage?: Pick<Storage, 'getItem' | 'setItem'>; fetch?: typeof fetch; base?: string;
        createMedia?: () => HTMLAudioElement } = {}) {
        this.createContext = options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
        this.createMedia = options.createMedia ?? (() => document.createElement('audio'));
        this.now = options.now ?? (() => performance.now() / 1000);
        this.storage = options.storage;
        this.fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
        this.base = options.base ?? '/';
        try { this.configure(JSON.parse(this.storage?.getItem(preferenceKey) ?? '{}'), false); }
        catch { /* Optional local preference is independent of campaign saves. */ }
    }
    get enabled() { return this.consent && !this.preferences.muted && !this.disposed; }
    get settings() { return { ...this.preferences }; }
    /** Call only from an actual start/control gesture; a saved unmuted preference is intent,
     * not an already running browser context. Deliberate mute/volume settings remain authoritative. */
    restoreFromGesture(): Promise<boolean> {
        if (this.disposed || this.hidden || this.preferences.muted) return Promise.resolve(false);
        if (this.audible()) return Promise.resolve(true);
        if (this.gestureActivation) return this.gestureActivation;
        const activation = this.enable().finally(() => {
            if (this.gestureActivation === activation) this.gestureActivation = undefined;
        });
        this.gestureActivation = activation;
        return activation;
    }
    async enable() {
        if (this.disposed) return false;
        try {
            this.failure = '';
            if (!this.context) {
                this.context = this.createContext();
                this.master = this.context.createGain();
                this.master.connect(this.context.destination);
                for (const bus of ['ambience', 'world', 'interface'] as const) {
                    const gain = this.context.createGain();
                    gain.connect(this.master);
                    this.buses.set(bus, gain);
                }
                this.context.addEventListener('statechange', () => {
                    if (String(this.context?.state) !== 'running') {
                        this.foregroundTrack?.suspend();
                        this.stopAll();
                    }
                    this.changed?.();
                });
            }
            this.requestPlaybackSession();
            this.consent = true;
            this.configure({ muted: false });
            await this.resume();
            return this.audible();
        } catch {
            this.failure = 'Sound unavailable. Use Enable sound to try again.';
            this.changed?.();
            return false;
        }
    }
    private requestPlaybackSession() {
        try {
            const session = typeof navigator === 'undefined' ? undefined :
                (navigator as Navigator & { audioSession?: PlaybackSession }).audioSession;
            if (!session) return;
            this.playbackSession ??= { session, previous: session.type };
            // Safari's default ambient route follows the iPhone ringer switch.
            // Explicit Enable sound requests media playback, still suspended while hidden.
            session.type = 'playback';
        } catch { /* Optional routing support must not prevent ordinary Web Audio playback. */ }
    }
    configure(values: Partial<SoundPreferences>, persist = true) {
        if (typeof values.muted === 'boolean') this.preferences.muted = values.muted;
        for (const key of ['master', 'ambience', 'world', 'interface'] as const) {
            const value = values[key];
            if (typeof value === 'number' && Number.isFinite(value))
                this.preferences[key] = Math.max(0, Math.min(1, value));
        }
        if (persist) try { this.storage?.setItem(preferenceKey, JSON.stringify(this.preferences)); }
        catch { /* Audio intent never writes a canonical save. */ }
        if (this.master) this.ramp(this.master.gain, this.enabled && !this.hidden ? this.preferences.master * .6 : 0);
        this.applyBusGains();
        this.foregroundTrack?.refreshVolume();
        if (this.preferences.muted) {
            this.foregroundTrack?.suspend();
            this.stopAll();
            void this.context?.suspend().catch(() => {});
        }
        this.changed?.();
    }
    setHidden(hidden: boolean) {
        if (hidden === this.hidden) return;
        this.hidden = hidden;
        if (hidden) this.foregroundTrack?.suspend();
        this.stopAll();
        if (hidden) void this.context?.suspend().catch(() => {});
        else if (this.enabled) void this.resume();
        this.changed?.();
    }
    private async resume() {
        try {
            if (this.enabled && !this.hidden) await this.context?.resume();
            if (!this.enabled || this.hidden) await this.context?.suspend();
            else this.configure({}, false);
        } catch { this.failure = 'Sound suspended. Use Enable sound to resume.'; }
    }
    private audible() { return this.enabled && !this.hidden && this.context?.state === 'running'; }
    private ramp(parameter: AudioParam, value: number) {
        parameter.cancelScheduledValues(this.context!.currentTime);
        parameter.setTargetAtTime(value, this.context!.currentTime, .06);
    }
    private applyBusGains() {
        for (const [bus, gain] of this.buses) {
            const duck = this.foregroundDucking ? bus === 'ambience' ? .22 : bus === 'world' ? .35 : 1 : 1;
            this.ramp(gain.gain, this.preferences[bus] * duck);
        }
    }
    private releaseForeground() {
        this.foregroundTrack?.dispose();
        this.foregroundTrack = undefined;
    }
    /** A single streamed foreground lease shares consent, preferences and the existing context. */
    foreground(asset: ForegroundAsset, options: { spatial?: boolean } = {}): ForegroundTrack {
        this.releaseForeground();
        const track = new ForegroundTrack(asset, {
            createMedia: this.createMedia,
            allowed: () => this.audible(),
            resolve: path => this.base + path,
            connect: media => {
                if (!this.context || !this.master) throw new Error('Enable sound before playing music.');
                const source = this.context.createMediaElementSource(media);
                const gain = this.context.createGain();
                source.connect(gain);
                const panner = options.spatial ? this.context.createPanner() : undefined;
                let position: SoundPoint | undefined;
                if (panner) {
                    panner.panningModel = 'equalpower';
                    panner.rolloffFactor = 0; // Same explicit bounded attenuation as the existing world sounds.
                    panner.channelCount = 1;
                    panner.channelCountMode = 'explicit';
                    gain.connect(panner);
                    panner.connect(this.buses.get('world')!);
                } else gain.connect(this.master);
                return {
                    position: point => {
                        position = { ...point };
                        panner?.positionX.setValueAtTime(point.x, this.context!.currentTime);
                        panner?.positionY.setValueAtTime(point.y, this.context!.currentTime);
                        panner?.positionZ.setValueAtTime(point.z, this.context!.currentTime);
                    },
                    gain: value => {
                        const scope = this.current;
                        const separation = position && scope?.listener?.valid ?
                            Math.hypot(position.x - scope.listener.position.x, position.y - scope.listener.position.y,
                                position.z - scope.listener.position.z) : Infinity;
                        const spatial = Math.max(0, 1 - separation / 100) *
                            Math.min(1, 40 / Math.max(40, scope?.camera?.distance ?? Infinity));
                        this.ramp(gain.gain, .8 * value * (panner ? spatial : this.preferences.world));
                    },
                    dispose: () => { source.disconnect(); gain.disconnect(); panner?.disconnect(); },
                };
            },
            duck: active => {
                if (options.spatial) return;
                if (this.foregroundTrack !== track || this.foregroundDucking === active) return;
                this.foregroundDucking = active;
                this.applyBusGains();
            },
        });
        this.foregroundTrack = track;
        return track;
    }
    world(manifest: SoundManifest, base?: string) {
        this.releaseForeground();
        if (base !== undefined) this.base = base;
        if (this.current) this.current.alive = false;
        this.stopAll();
        const scope: World = { alive: true, sources: [], last: -Infinity, paused: true,
            plan: new Soundscape(manifest.cues.slice(0, 64)) };
        this.current = scope;
        const due = () => scope.alive && this.current === scope && this.audible() &&
            this.now() - scope.last >= soundLimits.cadence;
        const sampleRate = () => this.context?.sampleRate ?? null;
        return {
            get due() { return due(); },
            get sampleRate() { return sampleRate(); },
            ready: (cueId: string) => {
                const cue = manifest.cues.find(cue => cue.id === cueId);
                const asset = manifest.assets.find(asset => asset.id === cue?.variants[0]);
                return scope.alive && this.current === scope && this.audible() && !!asset &&
                    this.budgetAllows(asset, manifest) && this.buffers.has(JSON.stringify(asset));
            },
            prepare: (cueId: string) => {
                if (!scope.alive || this.current !== scope || !this.audible() || this.loading.size >= 2) return;
                const cue = manifest.cues.find(cue => cue.id === cueId);
                const asset = manifest.assets.find(asset => asset.id === cue?.variants[0]);
                if (asset && this.budgetAllows(asset, manifest)) void this.buffer(asset, manifest).catch(() => {
                    if (scope.alive && this.current === scope && !this.disposed)
                        this.failure = 'An audio cue could not be loaded; gameplay is unaffected.';
                });
            },
            update: (camera: SoundCamera, sources: readonly SoundEmitter[], paused: boolean, contact = false) => {
                const started = performance.now();
                try { this.updateWorld(scope, manifest, camera, sources, paused, contact); }
                catch {
                    this.failure = 'Sound interrupted; gameplay is unaffected. Use Enable sound to retry.';
                    this.stopAll();
                    this.changed?.();
                }
                finally { this.retainMeasurement(this.selectionMs, performance.now() - started); }
            },
            pause: () => {
                if (!scope.alive || this.current !== scope || this.disposed) return;
                scope.paused = true;
                try {
                    if (scope.camera) this.updateWorld(scope, manifest, scope.camera, scope.sources, true, true);
                } catch {
                    this.failure = 'Sound interrupted; gameplay is unaffected. Use Enable sound to retry.';
                    this.stopAll();
                }
            },
            dispose: () => {
                scope.alive = false;
                if (this.current === scope) {
                    this.stopAll();
                    this.current = undefined;
                }
            },
        };
    }
    private budgetAllows(asset: SoundAsset, manifest: SoundManifest): boolean {
        const budget = manifest.decodedBudget;
        if (!budget) return true;
        if (!Array.isArray(budget.assetIds)) return false;
        if (!budget.assetIds.includes(asset.id)) return true;
        const rate = this.context?.sampleRate;
        if (!rate || !Number.isFinite(rate) || rate <= 0 ||
            !Number.isSafeInteger(budget.maximumBytes) || budget.maximumBytes <= 0 ||
            budget.maximumBytes > soundLimits.decodedBytes || !budget.assetIds.length ||
            budget.assetIds.length > soundLimits.buffers ||
            new Set(budget.assetIds).size !== budget.assetIds.length) return false;
        let bytes = 0;
        for (const id of budget.assetIds) {
            const member = manifest.assets.find(candidate => candidate.id === id);
            if (!member || !Number.isFinite(member.seconds) || member.seconds <= 0 ||
                member.seconds > 30 || ![1, 2].includes(member.channels)) return false;
            const cached = this.buffers.get(JSON.stringify(member));
            bytes += cached ? cached.length * cached.numberOfChannels * 4 :
                Math.ceil(member.seconds * rate) * member.channels * 4;
        }
        return bytes <= budget.maximumBytes && this.decodedFamilyBytes(manifest) <= budget.maximumBytes;
    }

    private decodedFamilyBytes(manifest: SoundManifest, additional?: { asset: SoundAsset; buffer: AudioBuffer }) {
        const budget = manifest.decodedBudget;
        if (!budget) return 0;
        let bytes = 0;
        const additionalKey = additional ? JSON.stringify(additional.asset) : undefined;
        for (const asset of manifest.assets) {
            if (!budget.assetIds.includes(asset.id)) continue;
            const key = JSON.stringify(asset);
            const buffer = additional && key === additionalKey ?
                additional.buffer : this.buffers.get(key);
            if (buffer) bytes += buffer.length * buffer.numberOfChannels * 4;
        }
        return bytes;
    }

    private updateWorld(scope: World, manifest: SoundManifest, camera: SoundCamera,
        sources: readonly SoundEmitter[], paused: boolean, contact = false) {
        if (!scope.alive || this.current !== scope || this.disposed) return;
        scope.sources = sources.slice(0, soundLimits.emitters);
        scope.camera = camera;
        scope.paused = paused;
        if (!this.audible() || (!contact && this.now() - scope.last < soundLimits.cadence)) return;
        scope.last = this.now();
        const plan = scope.plan.update(this.now(), camera, scope.sources, paused);
        for (const voice of plan.voices)
            if (this.requestedCues.has(voice.cue.id) || this.requestedCues.size < 64)
                this.requestedCues.set(voice.cue.id, (this.requestedCues.get(voice.cue.id) ?? 0) + 1);
        scope.listener = plan.listener;
        this.listener(plan.listener);
        const desired = new Set(plan.voices.map(voice => voice.source.id));
        for (const [id, voice] of this.voices) {
            const present = scope.sources.find(source => source.id === id);
            const gain = present && plan.listener.valid ?
                soundGain(voice.cue, present, plan.listener.position, camera.distance, paused) : 0;
            if (!(gain > 0) || present?.cue !== voice.cue.id || present.revision !== voice.revision ||
                (voice.loop && !desired.has(id))) this.stop(id, true);
            else this.ramp(voice.gain.gain, gain);
        }
        for (const voice of plan.voices) {
            const existing = this.voices.get(voice.source.id);
            if (existing && existing.revision === voice.source.revision && existing.cue.id === voice.cue.id)
                this.adjust(existing, voice);
            else if (!this.pending.has(voice.source.id)) void this.start(scope, manifest, voice);
        }
    }
    private listener(input: ReturnType<Soundscape['update']>['listener']) {
        if (!input.valid || !this.context) return;
        const listener = this.context.listener;
        const { x, y, z } = input.position, forward = input.forward;
        if (input.jumped && this.master) {
            this.master.gain.setValueAtTime(0, this.context.currentTime);
            this.ramp(this.master.gain, this.preferences.master * .6);
        }
        if (listener.positionX) {
            for (const [parameter, value] of [[listener.positionX, x], [listener.positionY, y], [listener.positionZ, z],
                [listener.forwardX, forward.x], [listener.forwardY, 0], [listener.forwardZ, forward.z],
                [listener.upX, 0], [listener.upY, 1], [listener.upZ, 0]] as const)
                parameter.setValueAtTime(value, this.context.currentTime);
        } else {
            listener.setPosition(x, y, z);
            listener.setOrientation(forward.x, 0, forward.z, 0, 1, 0);
        }
    }
    private adjust(voice: Voice, input: SoundVoice) {
        this.ramp(voice.gain.gain, input.gain);
        const p = input.source.position;
        if (p && voice.panner) {
            voice.panner.positionX.setValueAtTime(p.x, this.context!.currentTime);
            voice.panner.positionY.setValueAtTime(p.y, this.context!.currentTime);
            voice.panner.positionZ.setValueAtTime(p.z, this.context!.currentTime);
        }
    }
    private async start(scope: World, manifest: SoundManifest, input: SoundVoice) {
        const proposed = manifest.assets.find(asset => asset.id === input.variant);
        if (proposed && !this.budgetAllows(proposed, manifest)) return;
        if (this.inflightClients >= soundLimits.beds + soundLimits.local) return;
        this.inflightClients++;
        const id = input.source.id, reservation = {};
        const revision = input.source.revision, event = input.source.event;
        this.pending.set(id, reservation);
        try {
            const asset = manifest.assets.find(asset => asset.id === input.variant);
            if (!asset) throw new Error('Missing cue variant');
            const key = JSON.stringify(asset);
            if (this.loading.size >= 2 && !this.loading.has(key) && !this.buffers.has(key)) return;
            const buffer = await this.buffer(asset, manifest);
            const latest = scope.sources.find(source => source.id === id);
            const gainNow = latest && scope.listener?.valid && scope.camera ?
                soundGain(input.cue, latest, scope.listener.position, scope.camera.distance, scope.paused) : 0;
            if (!this.audible() || !scope.alive || this.current !== scope ||
                this.pending.get(id) !== reservation || latest?.revision !== revision ||
                latest?.cue !== input.cue.id || latest.event !== event || !(gainNow > 0)) return;
            const peers = [...this.voices.entries()].filter(([, voice]) =>
                (voice.cue.bus === 'ambience') === (input.cue.bus === 'ambience'));
            const family = peers.filter(([, voice]) => voice.cue.id === input.cue.id);
            if (family.length >= Math.min(4, input.cue.limit)) return;
            const limit = input.cue.bus === 'ambience' ? soundLimits.beds : soundLimits.local;
            if (peers.length >= limit) {
                peers.sort((a, b) => a[1].cue.priority - b[1].cue.priority);
                if (peers[0][1].cue.priority >= input.cue.priority) return;
                this.stop(peers[0][0], true);
            }
            const source = this.context!.createBufferSource(), gain = this.context!.createGain();
            source.buffer = buffer;
            source.loop = input.cue.loop;
            source.playbackRate.value = input.pitch;
            source.loopStart = input.cue.loopStart ?? 0;
            source.loopEnd = input.cue.loopEnd ?? buffer.duration;
            source.connect(gain);
            const voice: Voice = { source, gain, cue: input.cue, revision,
                loop: input.cue.loop };
            if (input.source.position && input.cue.bus === 'world') {
                voice.panner = this.context!.createPanner();
                voice.panner.panningModel = 'equalpower';
                voice.panner.rolloffFactor = 0; // Explicit finite gain/cutoff is owned by Soundscape.
                gain.connect(voice.panner);
                voice.panner.connect(this.buses.get(input.cue.bus)!);
            } else gain.connect(this.buses.get(input.cue.bus)!);
            this.voices.set(id, voice);
            source.onended = () => {
                source.disconnect();
                gain.disconnect();
                voice.panner?.disconnect();
                this.retiring.delete(voice);
                if (this.voices.get(id) === voice) this.voices.delete(id);
            };
            gain.gain.value = 0;
            this.adjust(voice, { ...input, gain: gainNow, source: latest! });
            source.start(0, Math.max(0, Math.min(buffer.duration, input.cue.contactOffset ?? 0)));
            if (this.starts.has(input.cue.id) || this.starts.size < 64)
                this.starts.set(input.cue.id, (this.starts.get(input.cue.id) ?? 0) + 1);
            this.highVoices = Math.max(this.highVoices, this.voices.size);
            this.highPhysical = Math.max(this.highPhysical, this.voices.size + this.retiring.size);
        } catch {
            if (this.pending.get(id) === reservation) this.stop(id);
            if (!this.disposed) this.failure = 'An audio cue could not be loaded; gameplay is unaffected.';
        }
        finally {
            this.inflightClients--;
            if (this.pending.get(id) === reservation) this.pending.delete(id);
        }
    }
    private async load(asset: SoundAsset): Promise<AudioBuffer> {
        if (!asset.proof) {
            if (!asset.path?.startsWith('game-assets/audio/') || /\.\.|[:?#\\]/.test(asset.path))
                throw new Error('Only prepared local audio is allowed');
            const response = await this.fetch(this.base + asset.path,
                { signal: this.downloads.signal, redirect: 'error' });
            if (!response.ok || Number(response.headers.get('Content-Length')) > soundLimits.fileBytes)
                throw new Error('Audio file unavailable or too large');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Audio streaming unavailable');
            const chunks: Uint8Array[] = [];
            let size = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                this.downloadBytes += value.byteLength;
                if (size > soundLimits.fileBytes) {
                    await reader.cancel();
                    throw new Error('Audio file too large');
                }
                chunks.push(value);
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
            const started = performance.now();
            const operation = this.context!.decodeAudioData(bytes.buffer);
            this.retainMeasurement(this.decodeCallMs, performance.now() - started);
            try { return await operation; }
            finally { this.retainMeasurement(this.decodeWallMs, performance.now() - started); }
        }
        const rate = this.context!.sampleRate;
        const buffer = this.context!.createBuffer(asset.channels, Math.ceil(asset.seconds * rate), rate);
        let seed = 12;
        for (let channel = 0; channel < asset.channels; channel++) {
            const samples = buffer.getChannelData(channel);
            for (let index = 0; index < samples.length; index++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                const edge = Math.min(1, index / (rate * .01), (samples.length - 1 - index) / (rate * .01));
                samples[index] = asset.proof === 'noise' ? (seed / 4294967296 - .5) * .08 * edge :
                    Math.sin(index / rate * Math.PI * 2 * (asset.frequency ?? 220)) * .15 *
                        Math.sin(index / samples.length * Math.PI) ** 2;
            }
        }
        return buffer;
    }
    private async buffer(asset: SoundAsset, manifest: SoundManifest) {
        const key = JSON.stringify(asset);
        const cached = this.buffers.get(key);
        if (cached) {
            this.buffers.delete(key);
            this.buffers.set(key, cached);
            return cached;
        }
        const loading = this.loading.get(key);
        if (loading) return loading;
        if (this.loading.size >= 2 || this.failed.has(key)) throw new Error('Audio unavailable');
        const bytes = asset.seconds * this.context!.sampleRate * asset.channels * 4;
        if (!(asset.seconds > 0 && asset.seconds <= 30) || ![1, 2].includes(asset.channels) || bytes > 8 * 1024 * 1024)
            throw new Error('Invalid prepared audio metadata');
        const operation = this.load(asset).then(buffer => {
            if (this.disposed) return buffer;
            const bytes = buffer.length * buffer.numberOfChannels * 4;
            if (bytes > 8 * 1024 * 1024) throw new Error('Decoded audio too large');
            const budget = manifest.decodedBudget;
            if (budget?.assetIds.includes(asset.id) &&
                this.decodedFamilyBytes(manifest, { asset, buffer }) > budget.maximumBytes)
                throw new Error('Decoded audio family exceeds its budget');
            const held = new Set([...this.voices.values(), ...this.retiring].map(voice => voice.source.buffer));
            let retained = [...this.buffers.values()].reduce((sum, value) =>
                sum + value.length * value.numberOfChannels * 4, 0);
            for (const [id, value] of this.buffers) {
                if (retained + bytes <= soundLimits.decodedBytes && this.buffers.size < soundLimits.buffers) break;
                if (held.has(value)) continue;
                this.buffers.delete(id);
                retained -= value.length * value.numberOfChannels * 4;
            }
            if (retained + bytes > soundLimits.decodedBytes || this.buffers.size >= soundLimits.buffers)
                throw new Error('Decoded cache full');
            this.buffers.set(key, buffer);
            return buffer;
        }).catch(error => {
            if (!this.disposed && this.failed.size < 64) this.failed.add(key);
            throw error;
        }).finally(() => this.loading.delete(key));
        this.loading.set(key, operation);
        return operation;
    }
    private stop(id: string, fade = false) {
        const voice = this.voices.get(id);
        if (!voice) return;
        this.voices.delete(id);
        if (fade && this.retiring.size < soundLimits.fading && this.context?.state === 'running') {
            this.retiring.add(voice);
            this.ramp(voice.gain.gain, 0);
            try { voice.source.stop(this.context.currentTime + .2); } catch { /* Already ended. */ }
            return;
        }
        try { voice.source.stop(); } catch { /* Already ended. */ }
        voice.source.disconnect();
        voice.gain.disconnect();
        voice.panner?.disconnect();
    }
    private stopAll() {
        this.pending.clear();
        for (const id of this.voices.keys()) this.stop(id);
        for (const voice of this.retiring) {
            try { voice.source.stop(); } catch { /* Already ended. */ }
            voice.source.disconnect();
            voice.gain.disconnect();
            voice.panner?.disconnect();
        }
        this.retiring.clear();
    }
    /** Existing scene diagnostics cadence also refreshes the shared settings view. */
    sample() {
        this.changed?.();
        return this.inspect();
    }
    private retainMeasurement(samples: number[], value: number) {
        samples.push(value);
        if (samples.length > 512) samples.shift();
    }
    private timings(samples: number[]) {
        const sorted = [...samples].sort((a, b) => a - b);
        const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
        return { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99) };
    }
    inspect() {
        return { foreground: this.foregroundTrack?.inspect() ?? null, foregroundDucking: this.foregroundDucking,
            enabled: this.enabled, hidden: this.hidden, state: this.context?.state ?? 'not-enabled',
            playing: this.voices.size, retiring: this.retiring.size,
            physical: this.voices.size + this.retiring.size,
            pending: this.pending.size, decodes: this.loading.size, highVoices: this.highVoices,
            inflightClients: this.inflightClients,
            highPhysical: this.highPhysical,
            buffers: this.buffers.size,
            downloadBytes: this.downloadBytes,
            startedCues: Object.fromEntries(this.starts),
            requestedCues: Object.fromEntries(this.requestedCues),
            selectionScheduling: this.timings(this.selectionMs),
            decodeInvocation: this.timings(this.decodeCallMs),
            decodeWall: this.timings(this.decodeWallMs),
            decodedBytes: [...this.buffers.values()].reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0),
            failure: this.failure };
    }
    async dispose() {
        this.releaseForeground();
        this.disposed = true;
        if (this.current) this.current.alive = false;
        this.stopAll();
        this.buffers.clear();
        this.failed.clear();
        this.downloads.abort();
        this.master?.disconnect();
        for (const gain of this.buses.values()) gain.disconnect();
        this.buses.clear();
        try { await this.context?.close(); } catch { /* Browser teardown is best effort. */ }
        const previous = this.playbackSession;
        this.playbackSession = undefined;
        try {
            if (previous?.session.type === 'playback') previous.session.type = previous.previous;
        } catch { /* Optional device routing may already be unavailable during teardown. */ }
    }
}
