import * as gameVersion from '../../game-version.json';
import { describeGameVersion } from './GameVersion';

export interface GameBuildInfo {
    readonly schemaVersion: 1;
    readonly version: string;
    readonly displayVersion: string;
    readonly channel: string;
    readonly origin: 'local' | 'preview' | 'distributable';
    readonly buildNumber: number | null;
    readonly buildId: string;
    readonly builtAt: string | null;
    readonly legacyBuild: string;
    readonly configuration?: Readonly<{ feedbackURL: string }>;
    readonly versionTag?: string;
    readonly inputHash?: string;
    readonly source: Readonly<{ commit: string | null; dirty: boolean | null;
        provenance: 'git' | 'sites-export' | 'unknown'; branch?: string }>;
    readonly sequence?: Readonly<{ authority: string; runId: string; attempt: number }>;
}

type BuildGlobals = typeof globalThis & { __FJORD_BUILD_INFO__?: GameBuildInfo; __FJORD_BUILD__?: string };
const legacy = (globalThis as BuildGlobals).__FJORD_BUILD__ ?? 'unidentified-source';
const commit = /^[a-f0-9]{40}/.exec(legacy)?.[0] ?? null;
const fallback: GameBuildInfo = { schemaVersion: 1, ...describeGameVersion(gameVersion.version),
    origin: 'local', buildNumber: null, buildId: 'local-' + legacy, builtAt: null, legacyBuild: legacy,
    source: { commit, dirty: commit ? legacy.includes('-dirty') : null, provenance: 'unknown' } };
const identity = (globalThis as BuildGlobals).__FJORD_BUILD_INFO__ ?? fallback;
Object.freeze(identity.source);
if (identity.sequence) Object.freeze(identity.sequence);
if (identity.configuration) Object.freeze(identity.configuration);
Object.freeze(identity);

/** The loaded bundle owns this identity, even when a server later hosts a newer manifest. */
export function getBuildInfo(): GameBuildInfo { return identity; }

export function formatBuildLabel(info = getBuildInfo()): string {
    if (info.buildNumber !== null) return info.displayVersion + ' · ' +
        (info.origin === 'preview' ? 'preview build ' : 'build ') + info.buildNumber +
        (info.sequence && info.sequence.attempt > 1 ? ' · attempt ' + info.sequence.attempt : '');
    return info.displayVersion + ' · local ' + (info.source.commit?.slice(0, 7) ?? 'unknown source') +
        (info.source.dirty ? '-dirty' : '');
}

export function buildDetailsText(info = getBuildInfo()): string {
    return [formatBuildLabel(info), 'Build ID: ' + info.buildId, 'Source: ' + (info.source.commit ?? 'unidentified-source'),
        'Source status: ' + (info.source.dirty === null ? 'unknown' : info.source.dirty ? 'dirty' : 'clean'),
        'Provenance: ' + info.source.provenance, 'Origin: ' + info.origin,
        'Built UTC: ' + (info.builtAt ?? 'unknown'),
        ...(info.sequence ? ['Sequence: ' + info.sequence.authority, 'Run: ' + info.sequence.runId + ' · attempt ' + info.sequence.attempt] : []),
        ...(info.inputHash ? ['Input SHA-256: ' + info.inputHash] : [])].join('\n');
}
