// THROWAWAY #318: data mask, not a new copy of the artwork.
// The supplied cutout was recomposed slightly. Conservative vector gates keep the
// actual approved photograph's ridge, shore and pier outside the moving areas.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = process.argv[2] ?? 'D:/CodexSites/Pillagers/Assets/Background-startgame/upscalemedia-transformed (3).png';
const target = 'src/fjord-play/prototypes/entry-motion-318/land-mask.png';
const width = 1024, height = 576;
const skyEdge = [
    [0,.15],[.20,.18],[.22,.375],[.25,.40],[.28,.40],[.30,.42],
    [.325,.41],[.35,.43],[.38,.47],[.405,.445],[.43,.41],[.45,.385],
    [.48,.38],[.52,.38],[.55,.32],[.58,.29],[.60,.315],[.62,.29],
    [.65,.24],[.67,.21],[.69,.245],[.72,.29],[.75,.295],[.78,.28],
    [.80,.29],[.815,.23],[.84,.19],[.87,.165],[.90,.16],[.92,.16],
    [.94,.13],[.96,.11],[.98,.10],[1,.10],
];
const waterEdge = [
    [.31,.68],[.325,.71],[.385,.73],[.395,.77],[.455,.78],[.465,.80],
    [.615,.80],[.625,.895],[.795,.895],[.81,1],[1,1],
    [1,.705],[.56,.66],[.45,.655],[.32,.655],
];
async function gate(points, blur = 3) {
    const path = points.map(([x,y]) => `${x*width},${y*height}`).join(' ');
    const svg = `<svg width="${width}" height="${height}"><defs><filter id="soft"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect width="100%" height="100%" fill="black"/><polygon points="${path}" fill="white" filter="url(#soft)"/></svg>`;
    return sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
}
const alpha = await sharp(source).resize(width,height,{fit:'fill'}).extractChannel('alpha').raw().toBuffer();
const sky = await gate([[0,0],[1,0],...skyEdge.toReversed()]);
const water = await gate(waterEdge, 18);
const waterBounds = await gate(waterEdge, 0);
const rgb = Buffer.alloc(width*height*3);
for(let i=0;i<alpha.length;i++) {
    const free = Math.max(0, 1 - alpha[i] / 247);
    rgb[i*3] = alpha[i];
    rgb[i*3+1] = Math.round(free*sky[i*3]);
    // The source cutout's shifted shore made a hard stripe beneath the village.
    // Trace the real photograph instead; fade only inward to keep structures still.
    const inward = Math.max(0, Math.min(1, (water[i*3] / 255 - .5) / .46));
    const fade = inward * inward * (3 - 2 * inward);
    rgb[i*3+2] = waterBounds[i*3] === 255 ? Math.round(fade * 255) : 0;
}
await sharp(rgb,{raw:{width,height,channels:3}}).png({compressionLevel:9}).toFile(target);
const bytes = await readFile(target);
console.log(JSON.stringify({target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
