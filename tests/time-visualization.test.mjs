import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial}=createRequire(import.meta.url)('three');
import {load} from './load-source.mjs';
const {WorldLighting}=load('../src/core/WorldLighting.ts');
const {SeasonTint}=load('../src/world/SeasonTint.ts');
const {daylight,seasonBlend}=load('../src/config/timeVisualization.ts');
test('year visualization wraps through four seasons and noon/midnight without a discontinuity',()=>{
    assert.deepEqual([0,.25,.5,.75,1].map(p=>seasonBlend(p).from.name),['Winter','Spring','Summer','Autumn','Winter']);
    assert.equal(daylight(0),daylight(1));assert.equal(daylight(0),0);assert.equal(daylight(.5),1);
    assert.ok(seasonBlend(.99999).mix>.9999999);
});
test('animated lighting and foliage reuse lights, shadow map and geometry, restoring Off and fog settings',()=>{
    const scene=new Scene(),renderer={shadowMap:{enabled:true},toneMappingExposure:1};
    const assets={windowMaterials:[new MeshStandardMaterial()],fireMaterials:[new MeshStandardMaterial()]};
    const lighting=new WorldLighting(scene,renderer,assets),resources=[...scene.children];
    lighting.setFog(false);lighting.setVisualization('day-night');
    const shadow={dispose(){throw new Error('Animated cycle must not reallocate shadow map');}};
    lighting.directional.shadow.map=shadow;
    lighting.update(0,0);const noon=scene.background.clone();lighting.update(30,.5);
    assert.notDeepEqual(scene.background,noon);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);assert.equal(scene.fog,null);
    lighting.update(60,1);assert.deepEqual(scene.background,noon);assert.equal(lighting.directional.shadow.map,shadow);
    const root=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),foliage=new Mesh(geometry,material),ground=new Mesh(geometry,material.clone());
    foliage.userData.seasonalFoliage=true;root.add(foliage,ground);const tint=new SeasonTint(root,ground);
    const own=foliage.material;assert.notEqual(own,material);
    const shader={uniforms:{},vertexShader:'#include <color_vertex>',fragmentShader:'#include <color_fragment>'};own.onBeforeCompile(shader);
    tint.update(0);assert.equal(shader.uniforms.seasonSnowAmount.value,.65);assert.match(shader.fragmentShader,/seasonMask=smoothstep/);
    lighting.setVisualization('seasons');
    for(const p of [0,.25,.5,.75,1]){lighting.update(p*60,p);tint.update(p);assert.equal(foliage.geometry,geometry);assert.equal(foliage.material,own);assert.deepEqual(scene.children,resources);}
    assert.notDeepEqual(own.color,material.color);assert.equal(lighting.directional.shadow.map,shadow);
    lighting.setVisualization('off');tint.update(null);assert.deepEqual(own.color,material.color);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);
    assert.equal(shader.uniforms.seasonSnowAmount.value,0);
    assert.equal(scene.fog,null);assert.equal(lighting.directional.shadow.mapSize.x,2048);
    tint.dispose();geometry.dispose();material.dispose();ground.material.dispose();lighting.halo.geometry.dispose();lighting.halo.material.dispose();
});

test('discovery scenery refresh preserves seasonal terrain color and shader ownership', () => {
    const root = new Group();
    const material = new MeshStandardMaterial({ color: 0xb8c89a });
    const ground = new Mesh(new BoxGeometry(), material);
    root.add(ground);
    const originalColor = material.color.clone();
    const originalHook = material.onBeforeCompile;
    const originalKey = material.customProgramCacheKey;
    let expected;
    for (let refresh = 0; refresh < 12; refresh++) {
        const tint = new SeasonTint(root, ground);
        tint.update(.5);
        expected ??= material.color.clone();
        assert.deepEqual(material.color, expected, 'Discovering more ground must not accumulate seasonal darkening');
        const shader = { uniforms: {}, fragmentShader: '#include <color_fragment>' };
        material.onBeforeCompile(shader);
        assert.equal(shader.fragmentShader.match(/uniform float seasonSnowAmount/g).length, 1);
        tint.dispose();
        assert.deepEqual(material.color, originalColor);
        assert.equal(material.onBeforeCompile, originalHook);
        assert.equal(material.customProgramCacheKey, originalKey);
    }
    ground.geometry.dispose(); material.dispose();
});

test('newly discovered foliage updates without replacing terrain seasonal shader uniforms', () => {
    const root = new Group(), geometry = new BoxGeometry();
    const ground = new Mesh(geometry, new MeshStandardMaterial());
    const source = new MeshStandardMaterial({ color: 0x628148 });
    const tree = new Mesh(geometry, source); tree.userData.seasonalFoliage = true;
    root.add(ground, tree);
    const tint = new SeasonTint(root, ground);
    const shader = { uniforms: {}, fragmentShader: '#include <color_fragment>' };
    ground.material.onBeforeCompile(shader);
    const hook = ground.material.onBeforeCompile, uniform = shader.uniforms.seasonSnowAmount;
    tint.update(0);
    tree.removeFromParent();
    const discoveredTree = new Mesh(geometry, source); discoveredTree.userData.seasonalFoliage = true;
    root.add(discoveredTree);
    tint.refreshFoliage(root);
    tint.update(.5);
    assert.equal(ground.material.onBeforeCompile, hook, 'Discovery retains the live terrain shader');
    assert.equal(shader.uniforms.seasonSnowAmount, uniform);
    assert.equal(uniform.value, 0);
    assert.notEqual(discoveredTree.material, source);
    tint.update(0);
    assert.equal(uniform.value, .65, 'The same GPU-bound terrain uniform still follows Winter');
    tint.dispose();
    assert.equal(discoveredTree.material, source);
    geometry.dispose(); ground.material.dispose(); source.dispose();
});


test('foliage snow classifies source colours before per-instance tint and treats uncoloured canopies as foliage', () => {
    const root = new Group(), geometry = new BoxGeometry();
    const ground = new Mesh(geometry, new MeshStandardMaterial());
    const canopy = new Mesh(geometry, new MeshStandardMaterial());
    const mixed = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true }));
    for (const tree of [canopy, mixed]) tree.userData.seasonalFoliage = true;
    root.add(ground, canopy, mixed);
    const tint = new SeasonTint(root, ground);
    for (const tree of [canopy, mixed]) {
        const shader = { uniforms: {}, vertexShader: '#include <color_vertex>',
            fragmentShader: '#include <color_fragment>' };
        tree.material.onBeforeCompile(shader);
        assert.match(shader.vertexShader, /vSeasonSourceColor=vec3\(0.0,1.0,0.0\)/);
        assert.match(shader.vertexShader, /#ifdef USE_COLOR\nvSeasonSourceColor=color.rgb/);
        assert.match(shader.fragmentShader, /vSeasonSourceColor.g\/max/);
        assert.doesNotMatch(shader.fragmentShader, /vColor\.g/,
            'The built-in vColor already includes random instance tints in the fragment stage');
        tint.update(0);
        assert.equal(shader.uniforms.seasonSnowAmount.value, .65);
        tint.update(.5);
        assert.equal(shader.uniforms.seasonSnowAmount.value, 0);
    }
    tint.dispose();
    geometry.dispose(); ground.material.dispose(); canopy.material.dispose(); mixed.material.dispose();
});
