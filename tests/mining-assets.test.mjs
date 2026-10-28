import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {terrainIO} from '../scripts/terrain-io.mjs';
import {getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';

test('the supplied mine publishes unchanged geometry with bounded textures and verified local bytes', async () => {
    const manifest = JSON.parse(readFileSync('public/game-assets/mining/manifest.json'));
    const runtime = manifest.runtime;
    const bytes = readFileSync('public/game-assets/mining/' + runtime.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), runtime.sha256);
    assert.equal(bytes.length, runtime.bytes);
    assert.ok(bytes.length < 2*1024*1024 && bytes.length < manifest.source.bytes/8);
    const doc = await (await terrainIO()).readBinary(bytes);
    const root = doc.getRoot();
    const triangles = root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n,p) =>
        n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
    assert.equal(triangles, manifest.source.triangles);
    assert.equal(runtime.geometrySha256,manifest.source.geometrySha256);
    const bounds = getBounds(root.listScenes()[0]);
    for (const key of ['min','max']) for(let axis=0;axis<3;axis++)
        assert.ok(Math.abs(bounds[key][axis]-manifest.source.bounds[key][axis])<1e-6);
    let pixels=0;
    for(const texture of root.listTextures()) {
        assert.equal(texture.getMimeType(),'image/webp');
        const info=await sharp(texture.getImage()).metadata();
        assert.ok(info.width<=1024 && info.height<=1024);
        pixels+=info.width*info.height;
    }
    assert.ok(pixels*4<=6*1024*1024);
});

test('the approved peat texture is published at 256 pixels with a small decoded mobile budget', async () => {
    const manifest=JSON.parse(readFileSync('public/game-assets/wetlands/manifest.json'));
    const bytes=readFileSync('public/game-assets/wetlands/'+manifest.runtime.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.runtime.sha256);
    assert.equal(bytes.length,manifest.runtime.bytes);
    const info=await sharp(bytes).metadata();
    assert.equal(info.width,256);assert.equal(info.height,256);
    assert.equal(info.format,'webp');assert.ok(bytes.length<32*1024);
    assert.equal(info.width*info.height*4,262144);
});

test('a disposed peat texture load closes a late browser bitmap without retaining GPU storage', async () => {
    const {loadDOMSource}=await import('./load-dom-source.mjs');
    const {WetlandTextureAsset}=loadDOMSource('../src/fjord-play/WetlandTextureAsset.ts');
    const bytes=readFileSync('public/game-assets/wetlands/bog-ground.webp');
    const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;
    let started,finish,closed=0,requests=0;
    const beginning=new Promise(resolve=>started=resolve),decoded=new Promise(resolve=>finish=resolve);
    const source=new WetlandTextureAsset();
    try {
        globalThis.fetch=async()=>{requests++;return new Response(bytes);};
        globalThis.createImageBitmap=async()=>{started();return decoded;};
        const pending=source.prepare();assert.equal(source.prepare(),pending);
        await beginning;source.dispose();finish({width:256,height:256,close:()=>closed++});
        assert.equal(await pending,undefined);assert.equal(closed,1);assert.equal(requests,1);
    } finally {
        source.dispose();globalThis.fetch=originalFetch;
        if(originalDecode===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=originalDecode;
    }
});


test('the selected Cattail has a credited, compact runtime model with its original 473 triangles', async () => {
    const manifest = JSON.parse(readFileSync('public/game-assets/wetlands/cattail-manifest.json', 'utf8'));
    assert.equal(manifest.source.url, 'https://poly.pizza/m/9vCk81sIPve');
    assert.equal(manifest.source.author, 'Poly by Google');
    assert.equal(manifest.source.license, 'CC-BY-3.0');
    const notice = readFileSync('public/game-assets/wetlands/ATTRIBUTION.txt', 'utf8');
    assert.match(notice, /Poly by Google/);
    assert.match(notice, /https:\/\/creativecommons.org\/licenses\/by\/3.0\//);
    const bytes = readFileSync('public/game-assets/wetlands/' + manifest.runtime.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.runtime.sha256);
    assert.ok(bytes.length < 64 * 1024);
    const root = (await (await terrainIO()).readBinary(bytes)).getRoot();
    const triangles = root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives()
        .reduce((n, p) => n + p.getIndices().getCount() / 3, 0), 0);
    assert.equal(triangles, 473);
    const bounds = getBounds(root.listScenes()[0]);
    assert.ok(Math.abs(bounds.min[1]) < 1e-6 && Math.abs(bounds.max[1] - 1) < 1e-6,
        'The runtime has a grounded, one-metre normalization for varied instanced heights');
    let texturePixels = 0;
    for (const texture of root.listTextures()) {
        const info = await sharp(texture.getImage()).metadata();
        assert.ok(info.width <= 128 && info.height <= 128);
        texturePixels += info.width * info.height;
    }
    assert.ok(texturePixels * 4 <= 65536);
});


test('late Cattail decoding releases its resources after the owning scene is disposed', async () => {
    const {loadDOMSource} = await import('./load-dom-source.mjs');
    const {WetlandModelAsset} = loadDOMSource('../src/fjord-play/WetlandModelAsset.ts');
    const {Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture} = createRequire(import.meta.url)('three');
    const bytes = readFileSync('public/game-assets/wetlands/cattail.glb');
    let start, finish, released = 0, closed = 0;
    const beginning = new Promise(resolve => start = resolve), decoded = new Promise(resolve => finish = resolve);
    const root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
    texture.image = {close: () => closed++};
    const material = new MeshStandardMaterial({map: texture});
    root.add(new Mesh(geometry, material));
    for (const resource of [geometry, texture, material]) resource.addEventListener('dispose', () => released++);
    const asset = new WetlandModelAsset('/', async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        async () => {start(); return decoded;});
    const pending = asset.prepare();
    assert.equal(asset.prepare(), pending, 'The browser downloads and decodes the shared template only once');
    await beginning; asset.dispose(); finish(root);
    assert.equal(await pending, undefined);
    assert.equal(released, 3); assert.equal(closed, 1);
    assert.equal(asset.inspect().state, 'disposed');
});
