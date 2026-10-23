import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sources = [
    'src/audio/FjordAudio.ts', 'src/audio/Soundscape.ts',
    'src/audio/SettlementSounds.ts', 'src/audio/WorkContacts.ts',
    'src/audio/SettlementSoundPack.ts', 'src/fjord-play/FjordScene.ts',
    'src/fjord-play/FjordEntry.ts', 'src/fjord-play/FjordEntities.ts',
    'src/fjord-play/FjordModels.ts', 'src/wildlife/WildlifeLayer.ts',
    'src/fjord-play/PerformanceMeasurements.ts', 'pnpm-lock.yaml',
    'scripts/audio/prepare-settlement-review.mjs', 'scripts/audio/serve-settlement-review.mjs',
    'scripts/audio/prepare-village-review.mjs', 'scripts/audio/prepare-work-review.mjs',
    'scripts/audio/measure-work-contact.mjs', 'scripts/audio/record-settlement-review.mjs',
    'tests/settlement-sounds.test.mjs', 'tests/fjord-audio.test.mjs',
];
// Follow the active HTML/bootstrap/entry references, excluding older retained builds.
const html = readFileSync('dist/index.html', 'utf8');
const bootstrap = 'dist/' + html.match(/src="\/(assets\/index-[\w-]+\.js)"/)[1];
const entry = 'dist/assets/' + readFileSync(bootstrap, 'utf8').match(/FjordEntry-[\w-]+\.js/)[0];
const scene = 'dist/assets/' + readFileSync(entry, 'utf8').match(/FjordPlay-[\w-]+\.js/)[0];
const bundles = ['dist/index.html', bootstrap, entry, scene];
const candidates = JSON.parse(readFileSync('scratch/sound-assets-229/latest.json')).output;
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const receipt = {
    recordedUtc: new Date().toISOString(),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    baseCommit: git(['rev-parse', 'HEAD']),
    status: git(['status', '--short']),
    scope: 'Local review build; dirty base ID is not a claim of current-head CI.',
    sourceSHA256: Object.fromEntries(sources.map(path => [path, hash(path)])),
    bundleSHA256: Object.fromEntries(bundles.map(path => [path, hash(path)])),
    catalogueSHA256: hash(candidates + '/catalogue.json'),
    manifestSHA256: hash(candidates + '/manifest.json'),
};
writeFileSync('docs/qa/settlement-soundscape-230/source-receipt.json',
    JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ sources: sources.length, bundles: bundles.length,
    catalogueSHA256: receipt.catalogueSHA256 }));
