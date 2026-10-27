import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

test('the three delivered instrument slots use compact real geometry and bounded embedded colour textures', async () => {
    const root = new URL('../public/game-assets/wedding/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
    assert.deepEqual(manifest.instruments.map(item => item.id), ['wedding-lyre', 'wedding-flute', 'wedding-frame-drum']);
    let triangles = 0, pixels = 0;
    for (const asset of manifest.instruments) {
        const bytes = readFileSync(new URL(asset.file, root));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
        assert.ok(bytes.length < 400000);
        const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
        assert.equal(data.skins?.length ?? 0, 0);
        for (const mesh of data.meshes) for (const primitive of mesh.primitives)
            triangles += data.accessors[primitive.indices].count / 3;
        assert.equal(data.images.length, 1);
        for (const image of data.images) {
            const view = data.bufferViews[image.bufferView], start = 28 + length + view.byteOffset;
            const info = await sharp(bytes.subarray(start, start + view.byteLength)).metadata();
            assert.ok(info.width <= 512 && info.height <= 512);
            pixels += info.width * info.height;
        }
        assert.equal(data.materials.length, 1);
        assert.equal(data.materials[0].normalTexture, undefined);
    }
    assert.ok(triangles <= 10000);
    assert.ok(pixels * 4 <= 3 * 1024 * 1024);
    const track = readFileSync(new URL(manifest.music.file, root));
    assert.equal(createHash('sha256').update(track).digest('hex'), manifest.music.sha256);
    assert.equal(manifest.music.source, 'Firelight_Vow_2026-10-26T145442.mp3');
    assert.ok(manifest.music.seconds > 5 && manifest.music.seconds < 180);
});
