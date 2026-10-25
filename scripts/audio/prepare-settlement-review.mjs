import { readFileSync, writeFileSync } from 'node:fs';

const latest = JSON.parse(readFileSync('scratch/sound-assets-229/latest.json'));
const manifest = JSON.parse(readFileSync(latest.output + '/manifest.json'));
const ids = ['wind-spring', 'wind-summer', 'wind-normal-winter', 'wind-harsh-winter',
    'sea-waves', 'campfire', 'gull', 'cow', 'goat', 'pig', 'sheep', 'seal', 'rabbit', 'wolf', 'lynx', 'axe-a'];
const assets = manifest.assets.filter(asset => ids.includes(asset.id));
const cues = manifest.cues.filter(cue => cue.variants.some(id => ids.includes(id))).map(cue => ({
    ...cue, variants: cue.variants.filter(id => ids.includes(id)),
    ...(cue.id === 'sea-waves' ? { bus: 'ambience', gain: .2 } : {}),
    ...(cue.id === 'axe-impact' ? { contactOffset: .0005416666666666666, cooldown: [.35, .8] } : {}),
}));
if (assets.length !== ids.length) throw new Error('Required private review candidate is missing');
writeFileSync('src/audio/SettlementSoundPack.ts',
    "import type { SoundManifest } from './FjordAudio';\n\n" +
    '/** Explicit mixed-scene review variant. Accepted v1 files are also published for ordinary gameplay.\n' +
    ' * Future candidates still require source and owner acceptance before publication. */\n' +
    'export const settlementReviewPack: SoundManifest = ' + JSON.stringify({ assets, cues }, null, 4) + ';\n');
console.log(JSON.stringify({ assets: assets.length, cues: cues.length }));
