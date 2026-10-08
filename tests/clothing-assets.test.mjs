import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,BufferGeometry,CylinderGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Matrix4,Triangle,Vector3} from 'three';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
import {garmentAuthoringMetadata} from '../scripts/characters/garment-authoring.mjs';
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {characterOutfit,baseOutfits,characterAsset}=load('../src/characters/CharacterAssets.ts');
const {goldenCharacters}=load('../src/characters/GoldenCharacters.ts');
const factory=new CharacterFactory(url=>geometryAsset(url.split('?')[0].slice(1)));
const {fitGarment,calibrateGarmentSource,disposeGarment}=load('../src/characters/GarmentFit.ts');

test('reference clothing is seed assigned, age/sex independent, cached and LOD2 only',async()=>{
    const styles=new Set(Array.from({length:100},(_,seed)=>characterOutfit(seed).style));
    assert.deepEqual(styles,new Set(baseOutfits.map(outfit=>outfit.style)));
    for(const outfit of baseOutfits){const asset=characterAsset(`garment/${outfit.style}`);assert.equal(asset.runtimeLOD,2);assert.deepEqual(Object.keys(asset.lods),['2']);}
    const first=await factory.create(goldenCharacters[0].dna,2),second=await factory.create({...goldenCharacters[0].dna,age:70},2);
    assert.equal(first.root.userData.outfit,second.root.userData.outfit);
    const id=`garment/${first.root.userData.outfit}`,a=first.fit.modules.get(id).object,b=second.fit.modules.get(id).object;
    assert.notEqual(a,b);assert.notEqual(a.children[0].geometry,b.children[0].geometry);
    assert.equal(first.fit.modules.has('technical-waist-wrap'),false);
    first.dispose();second.dispose();
});

test('all three generated outfits share the rig and preserve drape regions on the Golden Characters',async()=>{
    for(const fixture of goldenCharacters)for(const outfit of baseOutfits){
        const human=await factory.create(fixture.dna,2,false);
        const id=`garment/${outfit.style}`,module=await factory.equip(human,id);
        const body=human.root.getObjectByName('UniversalHuman'),revision=human.fit.revision;
        const source=await geometryAsset(`clothing/${outfit.style}/Clothing_${outfit.style}_LOD2.glb`);
        assert.equal(human.fit.modules.has('technical-waist-wrap'),false);
        assert.equal(body.geometry.index.count,sourceBodyIndexCount,'reference clothing must layer over the complete intact body');
        const originals=new Map(),sourceKeys=new Map(),regions=new Map();source.scene.updateMatrixWorld(true);
        source.scene.traverse(mesh=>{if(!mesh.isMesh)return;originals.set(mesh.name,Array.from(mesh.geometry.attributes.position.array));const keys=[];
            for(let i=0;i<mesh.geometry.attributes.position.count;i++){const key=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).toArray().map(v=>Math.round(v*1e5)).join(',');keys.push(key);const roles=regions.get(key)??new Set();roles.add(mesh.userData.garmentRegion);regions.set(key,roles);}sourceKeys.set(mesh.name,keys);
        });
        let triangleCount=0;const materials=new Set(),runtimeKeys=new Map(),runtimeRegions=new Map();
        module.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const reference=mesh.geometry.attributes.fitReference,keys=[];for(let i=0;i<reference.count;i++){const key=new Vector3().fromBufferAttribute(reference,i).toArray().map(v=>Math.round(v*1e5)).join(',');keys.push(key);const roles=runtimeRegions.get(key)??new Set();roles.add(mesh.userData.garmentRegion);runtimeRegions.set(key,roles);}runtimeKeys.set(mesh.name,keys);});
        module.traverse(mesh=>{
            if(!mesh.isSkinnedMesh)return;
            assert.equal(mesh.skeleton,body.skeleton,'clothing must not create a second armature');
            assert.ok(originals.has(mesh.name));assert.ok(mesh.geometry.attributes.fitReference,'fitted support points retain canonical source coordinates');triangleCount+=mesh.geometry.index.count/3;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){materials.add(material);assert.equal(material.flatShading,true,'faceted garments keep flat shading after skinning');}
            const weights=mesh.geometry.attributes.skinWeight,skin=mesh.geometry.attributes.skinIndex;
            assert.equal(new Set(mesh.geometry.index.array).size,mesh.geometry.attributes.position.count,'fitted clothing must not retain unused attribute rows');
            for(let i=0;i<weights.count;i++){
                assert.ok(Math.abs([0,1,2,3].reduce((sum,k)=>sum+weights.getComponent(i,k),0)-1)<1e-5);
                const influence=(pattern)=>[0,1,2,3].reduce((sum,k)=>sum+(pattern.test(mesh.skeleton.bones[skin.getComponent(i,k)].name)?weights.getComponent(i,k):0),0);
                if(runtimeRegions.get(runtimeKeys.get(mesh.name)[i]).size>1)continue;
                if(mesh.userData.garmentRegion==='skirt')assert.ok(influence(/^Hips$/)>=.49,'skirt follows hips, with shared seam weights at the bodice');
                if(mesh.userData.garmentRegion==='mantle')assert.ok(influence(/^(Chest|Spine_02)$/)>=.49,'mantle follows torso, with shared sleeve seam weights');
                if(mesh.userData.garmentRegion==='footwear'){const y=mesh.geometry.attributes.fitReference.getY(i);if(y<human.fit.canonicalJoints.get('Foot_L').y)assert.ok(influence(/^Foot_/)>=.49,'boot soles preserve the fixed foot shape and foot ownership');else assert.ok(influence(/^(Foot|LowerLeg)_/)>=.49,'boot shafts blend into the calf rather than deforming with the sole');}
            }
        });
        assert.ok(triangleCount<=4400,`${fixture.id}/${outfit.style}: source plus necessary fit supports exceed the ensemble budget`);assert.equal(materials.size,1,'one source atlas/material is shared by all garment regions');
        for(const animation of ['Idle','Walk','Run']){
            human.setAnimation(animation);
            for(let frame=0;frame<12;frame++){
                human.update(1/30);human.root.updateMatrixWorld(true);body.skeleton.update();
                const sewn=new Map();module.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                    const point=mesh.getVertexPosition(i,new Vector3()),key=runtimeKeys.get(mesh.name)[i];assert.ok(point.toArray().every(Number.isFinite),`${fixture.id}/${outfit.style}/${animation}: nonfinite skinning`);
                    if(sewn.has(key))assert.ok(point.distanceTo(sewn.get(key))<1e-5,`${outfit.style}/${animation}: duplicated seam points separate`);else sewn.set(key,point);
                }});
            }
        }
        assert.equal(human.fit.revision,revision,'animation must not refit garments');
        for(const [name,positions] of originals){const mesh=source.scene.getObjectByName(name);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),positions,'cached garment must stay immutable');}
        human.unequip(id);assert.equal(body.geometry.index.count,sourceBodyIndexCount);human.dispose();
    }
});
const sourceBodyIndexCount=(await geometryAsset('universal-human/UniversalHuman_LOD2.glb')).scene.getObjectByName('UniversalHuman').geometry.index.count;

test('measured torso domains exclude arm motion and grounded footwear compacts every owned attribute',async()=>{
    // Technical contract fixtures only. Published outfits retain generated art.
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_child_01').dna,2,false),source=new Group();
    const bodice=new Mesh(new CylinderGeometry(.27,.26,.35,12,4,true).translate(0,1.30,0),new MeshStandardMaterial());
    bodice.name='technical-bodice';bodice.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(bodice);
    const shoe=new Mesh(new BoxGeometry(.15,.06,.25).translate(.21,0,.07),bodice.material);
    shoe.name='technical-shoe';shoe.userData.garmentRegion='footwear';source.add(shoe);
    const referenceMetadata=characterAsset('garment/long-dress').metadata;
    const metadata={...referenceMetadata,id:'technical-regional-outfit',covers:[],garmentBind:{joints:Object.fromEntries(Object.keys(referenceMetadata.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}};
    const originalBodice=Array.from(bodice.geometry.attributes.position.array),body=human.root.getObjectByName('UniversalHuman'),sourceIndexCount=body.geometry.index.count;
    const module=human.equip(metadata,source),fitted=module.getObjectByName(bodice.name),skin=fitted.geometry.attributes.skinIndex,weights=fitted.geometry.attributes.skinWeight;
    for(let i=0;i<weights.count;i++)for(let k=0;k<4;k++)if(weights.getComponent(i,k)>1e-6)assert.equal(/Arm|Hand/.test(body.skeleton.bones[skin.getComponent(i,k)].name),false,'a sleeveless torso domain must never bind to the neighbouring upper arm');
    const footwear=module.getObjectByName(shoe.name),geometry=footwear.geometry;
    assert.equal(new Set(geometry.index.array).size,geometry.attributes.position.count);
    for(const attribute of Object.values(geometry.attributes))assert.equal(attribute.count,geometry.attributes.position.count,'compaction keeps all owned attribute buffers aligned');
    for(let i=0;i<geometry.attributes.position.count;i++)assert.ok(geometry.attributes.position.getY(i)>=-1e-7,'the shared root is the final boot sole plane');
    const before=Array.from(fitted.geometry.attributes.position.array),revision=human.fit.revision;
    human.setAnimation('Run');for(let i=0;i<10;i++)human.update(.025);
    assert.deepEqual(Array.from(fitted.geometry.attributes.position.array),before);assert.equal(human.fit.revision,revision);
    assert.deepEqual(Array.from(bodice.geometry.attributes.position.array),originalBodice);assert.equal(body.geometry.index.count,sourceIndexCount);
    human.dispose();bodice.geometry.dispose();shoe.geometry.dispose();bodice.material.dispose();
});

test('canonical drape follows uniform measured cage shrink on X Y and Z and retains adult identity',async()=>{
    // Homothetic contract fixture isolates the fit transform from sculpted DNA.
    // Both samples have the exact same canonical body, skeleton and garment.
    const source=new Group(),geometry=new CylinderGeometry(.65,.7,.4,12,1,true).translate(0,.68,0),material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);
    mesh.name='technical-homothetic-drape';mesh.userData.garmentRegion='skirt';source.add(mesh);
    const samples=[];
    for(const scale of [1,.5]){
        const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;
        body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index).multiplyScalar(scale);
        for(const volume of human.fit.cages.values()){
            volume.bounds.copy(volume.canonicalBounds).applyMatrix4(new Matrix4().makeScale(scale,scale,scale));
            const corners=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])corners.push(new Vector3(x,y,z));volume.points=corners;
        }
        const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-homothetic-module',clearance:.001,covers:[],garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}};
        const result=fitGarment(source,metadata,body,human.fit),fitted=result.getObjectByName(mesh.name),points=fitted.geometry.attributes.position,extents=new Vector3();
        for(let i=0;i<points.count;i++){extents.x=Math.max(extents.x,Math.abs(points.getX(i)));extents.y=Math.max(extents.y,points.getY(i));extents.z=Math.max(extents.z,Math.abs(points.getZ(i)));}
        samples.push(extents);result.traverse(node=>{if(node.isMesh)node.geometry.dispose();});human.dispose();
    }
    for(const axis of ['x','y','z'])assert.ok(Math.abs(samples[1][axis]/samples[0][axis]-.5)<.012,`${axis} must follow the measured uniform child scale`);
    assert.ok(Math.abs(samples[0].x-.7)<.006&&Math.abs(samples[0].z-.7)<.006,'identity cage preserves authored adult drape extents');
    geometry.dispose();material.dispose();
});

test('canonical authoring applies production garment clearance only once at runtime equip',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;
    body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index);
    for(const volume of human.fit.cages.values()){volume.bounds.copy(volume.canonicalBounds);const corners=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])corners.push(new Vector3(x,y,z));volume.points=corners;}
    const reference=characterAsset('garment/long-dress').metadata,metadata=Object.freeze({...reference,id:'technical-authoring-module',clearance:.025,covers:[],garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}});
    const source=new Group(),geometry=new CylinderGeometry(.65,.65,.2,8,1,true).translate(0,1.3,0),material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);mesh.name='technical-authoring-ring';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
    const authored=calibrateGarmentSource(source,garmentAuthoringMetadata(metadata),human.fit),direct=fitGarment(source,metadata,body,human.fit),equipped=fitGarment(authored,metadata,body,human.fit);
    const maximumX=group=>{const attribute=group.getObjectByName(mesh.name).geometry.attributes.position;return Math.max(...Array.from({length:attribute.count},(_,i)=>Math.abs(attribute.getX(i))));};
    assert.ok(Math.abs(maximumX(authored)-.65)<1e-5,'the authoring bake must preserve the unexpanded original source radius');
    assert.ok(maximumX(equipped)>maximumX(authored)+.02,'production equip still supplies the configured stand-off');
    assert.ok(Math.abs(maximumX(equipped)-maximumX(direct))<1e-5,'canonical bake plus equip must equal one production clearance pass');
    assert.equal(metadata.clearance,.025,'authoring must not alter registered production metadata');
    assert.equal(authored.userData.attachmentMetadata.garmentBind,metadata.garmentBind,'source joints remain the shared measured authority');
    for(const group of [direct,equipped])disposeGarment(group);authored.traverse(node=>{if(node.isMesh)node.geometry.dispose();});human.dispose();geometry.dispose();material.dispose();
});

test('measured source calibration is pure coordinates and preserves topology inside the body',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),reference=characterAsset('garment/long-dress').metadata;
    const canonicalJoints=Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]));
    const transform=new Matrix4().makeRotationY(.43).setPosition(new Vector3(.1,-.04,.06)),source=new Group(),geometry=new BoxGeometry(.09,.08,.06).translate(0,1.3,0),material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);
    mesh.name='technical-source-calibration';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};mesh.geometry.applyMatrix4(transform);source.add(mesh);
    const metadata={...reference,id:'technical-source-calibration-module',garmentBind:{joints:Object.fromEntries(Object.entries(canonicalJoints).map(([name,point])=>[name,new Vector3(...point).applyMatrix4(transform).toArray()]))}};
    const sourcePositions=Array.from(geometry.attributes.position.array),sourceIndex=Array.from(geometry.index.array),calibrated=calibrateGarmentSource(source,metadata,human.fit),actual=calibrated.getObjectByName(mesh.name).geometry,expected=new BoxGeometry(.09,.08,.06).translate(0,1.3,0);
    assert.deepEqual(Array.from(actual.index.array),sourceIndex,'coordinate calibration never adds collision support faces');
    assert.equal(actual.attributes.position.count,geometry.attributes.position.count);
    for(let i=0;i<actual.attributes.position.count;i++)assert.ok(new Vector3().fromBufferAttribute(actual.attributes.position,i).distanceTo(new Vector3().fromBufferAttribute(expected.attributes.position,i))<1e-6,'the measured rigid pose maps exactly even for points inside the body');
    assert.deepEqual(Array.from(geometry.attributes.position.array),sourcePositions,'authoring must keep the original asset immutable');
    assert.equal(calibrated.getObjectByName(mesh.name).material,material,'calibration does not replace the source palette');
    const canonicalMetadata={...metadata,garmentBind:{joints:canonicalJoints}},identity=calibrateGarmentSource(calibrated,canonicalMetadata,human.fit);
    for(let i=0;i<actual.attributes.position.count;i++)assert.ok(new Vector3().fromBufferAttribute(identity.getObjectByName(mesh.name).geometry.attributes.position,i).distanceTo(new Vector3().fromBufferAttribute(actual.attributes.position,i))<1e-6,'already canonical source is an identity calibration');
    for(const group of [calibrated,identity])group.traverse(node=>{if(node.isMesh)node.geometry.dispose();});human.dispose();geometry.dispose();expected.dispose();material.dispose();
});

test('source accessory surfaces stay in their hips layer instead of entering the free drape hull',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;
    body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index);
    for(const volume of human.fit.cages.values()){volume.bounds.copy(volume.canonicalBounds);const corners=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])corners.push(new Vector3(x,y,z));volume.points=corners;}
    const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-accessory-drape',clearance:.001,garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}},source=new Group(),material=new MeshStandardMaterial();
    const shell=new Mesh(new CylinderGeometry(.65,.65,.3,12,1,true).translate(0,.7,0),material);shell.name='technical-outer-drape';shell.userData.garmentRegion='skirt';source.add(shell);
    const tie=new Mesh(new BoxGeometry(.02,.2,.02).translate(0,.7,.35),material);tie.name='technical-source-tie';tie.userData={garmentRegion:'skirt',garmentSurface:'accessory'};source.add(tie);
    const calibrated=calibrateGarmentSource(source,metadata,human.fit);assert.equal(calibrated.getObjectByName(tie.name).userData.garmentSurface,'accessory');
    const module=fitGarment(source,metadata,body,human.fit),fitted=module.getObjectByName(tie.name),points=fitted.geometry.attributes.position,skin=fitted.geometry.attributes.skinIndex,weights=fitted.geometry.attributes.skinWeight;
    const maxZ=Math.max(...Array.from({length:points.count},(_,i)=>points.getZ(i)));
    assert.ok(maxZ<.39,'a source tie keeps its authored .35m layer instead of being pushed to the .65m outer drape hull');
    assert.ok(Math.abs(maxZ-.362)<2e-5,'a skirt tie reserves the same two-clearance wear layer as its supporting free drape');
    for(let i=0;i<weights.count;i++)for(let k=0;k<4;k++)if(weights.getComponent(i,k)>1e-5)assert.equal(body.skeleton.bones[skin.getComponent(i,k)].name,'Hips','the tie still follows the canonical hips bone');
    disposeGarment(module);calibrated.traverse(node=>{if(node.isMesh)node.geometry.dispose();});human.dispose();shell.geometry.dispose();tie.geometry.dispose();material.dispose();
});

test('source calibration keeps coincident boundary copies sewn across semantic pose domains',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),metadata=characterAsset('garment/long-dress').metadata,source=new Group(),material=new MeshStandardMaterial(),geometry=new BoxGeometry(.05,.04,.03).translate(.20,.25,-.12);
    for(const region of ['cloth','footwear']){const mesh=new Mesh(geometry.clone(),material);mesh.name='technical-source-seam-'+region;mesh.userData.garmentRegion=region;source.add(mesh);}
    const canonical=calibrateGarmentSource(source,metadata,human.fit),first=canonical.getObjectByName('technical-source-seam-cloth').geometry,second=canonical.getObjectByName('technical-source-seam-footwear').geometry;
    assert.equal(first.index.count,geometry.index.count);assert.equal(second.index.count,geometry.index.count);
    for(let i=0;i<first.attributes.position.count;i++)assert.ok(new Vector3().fromBufferAttribute(first.attributes.position,i).distanceTo(new Vector3().fromBufferAttribute(second.attributes.position,i))<1e-7,'shared source boundaries keep one calibrated position regardless of their cloth/boot mapping');
    for(const group of [source,canonical])group.traverse(node=>{if(node.isMesh)node.geometry.dispose();});human.dispose();geometry.dispose();material.dispose();
});

test('measured regional garments preserve local shoulder concavity while legacy garments retain broad cage fit',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;
    body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index);
    for(const volume of human.fit.cages.values()){volume.bounds.copy(volume.canonicalBounds);const corners=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])corners.push(new Vector3(x,y,z));volume.points=corners;}
    // A deliberately generous cage models a shoulder saddle: the cloth point is
    // inside its convex hull, yet outside the actual triangulated body surface.
    const torso=human.fit.cages.get('TORSO_CAGE');torso.bounds.set(new Vector3(-.7,1,-.7),new Vector3(.7,1.5,.7));torso.canonicalBounds.copy(torso.bounds);torso.points=[];for(const x of [-.7,.7])for(const y of [1,1.5])for(const z of [-.7,.7])torso.points.push(new Vector3(x,y,z));
    const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-local-body-fit',clearance:.001,garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}},source=new Group(),material=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(.02,.04,.02).translate(.2,1.3,.35),material);
    mesh.name='technical-saddle-cloth';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
    const measured=fitGarment(source,metadata,body,human.fit),legacy=fitGarment(source,{...metadata,id:'technical-legacy-cage-fit',garmentFit:undefined,garmentBind:undefined},body,human.fit),maxZ=group=>{const points=group.getObjectByName(mesh.name).geometry.attributes.position;return Math.max(...Array.from({length:points.count},(_,i)=>points.getZ(i)));};
    assert.ok(maxZ(measured)<.39,'actual body collision must preserve the authored local saddle instead of radial cage inflation');
    assert.ok(maxZ(legacy)>.65,'legacy modules still receive their broad envelope fitting policy');
    assert.equal(body.geometry.index.count,sourceBodyIndexCount,'local fitting cannot mask the underlying body');
    for(const group of [measured,legacy])disposeGarment(group);human.dispose();mesh.geometry.dispose();material.dispose();
});

test('source free drape calibration is independent of individual leg pose',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),reference=characterAsset('garment/long-dress').metadata,joints=Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]));
    for(const side of ['L','R'])for(const part of ['UpperLeg','LowerLeg','Foot','Toe']){joints[part+'_'+side][0]+=.08;joints[part+'_'+side][2]+=.15;}
    const source=new Group(),mesh=new Mesh(new CylinderGeometry(.35,.45,.4,10,1,true).translate(0,.7,0),new MeshStandardMaterial());mesh.name='technical-hip-owned-hem';mesh.userData.garmentRegion='skirt';source.add(mesh);
    const actual=calibrateGarmentSource(source,{...reference,garmentBind:{joints}},human.fit).getObjectByName(mesh.name).geometry.attributes.position,expected=mesh.geometry.attributes.position;
    assert.equal(actual.count,expected.count);
    for(let i=0;i<actual.count;i++)assert.ok(new Vector3().fromBufferAttribute(actual,i).distanceTo(new Vector3().fromBufferAttribute(expected,i))<1e-6,'individual source shin/foot poses cannot warp the hips-owned hem');
    human.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('measured clothing ratio scales body stand-off rather than the body-sized attachment axis',async()=>{
    const human=await factory.create(goldenCharacters.find(p=>p.id==='golden_neutral_01').dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index);
    for(const volume of human.fit.cages.values()){volume.bounds.copy(volume.canonicalBounds);const corners=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])corners.push(new Vector3(x,y,z));volume.points=corners;}
    const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-standoff-ratio',clearance:.01,garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}},source=new Group(),mesh=new Mesh(new CylinderGeometry(.65,.65,.04,16,1,true).translate(0,1.3,0),new MeshStandardMaterial());mesh.name='technical-stand-off-ring';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
    const modules=[1,1.3].map(ratio=>fitGarment(source,metadata,body,human.fit,ratio)),base=modules[0].getObjectByName(mesh.name).geometry.attributes.position,expanded=modules[1].getObjectByName(mesh.name).geometry.attributes.position;
    assert.equal(expanded.count,base.count,'already clear ring needs no new collision supports as spacing increases');
    const index=body.geometry.index,closest=(point)=>{let distance=Infinity,result=new Vector3();for(let i=0;i<index.count;i+=3){const triangle=new Triangle(...Array.from({length:3},(_,k)=>new Vector3().fromBufferAttribute(position,index.getX(i+k)))),candidate=triangle.closestPointToPoint(point,new Vector3()),d=candidate.distanceToSquared(point);if(d<distance){distance=d;result.copy(candidate);}}return result;};
    for(let i=0;i<base.count;i++){const point=new Vector3().fromBufferAttribute(base,i),anchor=closest(point),actual=new Vector3().fromBufferAttribute(expanded,i),expected=point.clone().sub(anchor).multiplyScalar(1.3).add(anchor);assert.ok(actual.distanceTo(expected)<2e-5,'only the measured garment-to-body stand-off vector is enlarged');}
    for(const group of modules)disposeGarment(group);human.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('exact canonical surface transport scales source torso stand-off with homothetic child anatomy',async()=>{
    const source=new Group(),mesh=new Mesh(new CylinderGeometry(.65,.65,.04,16,1,true).translate(0,1.3,0),new MeshStandardMaterial());mesh.name='technical-homothetic-torso';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
    const sourcePositions=Array.from(mesh.geometry.attributes.position.array),sourceUV=Array.from(mesh.geometry.attributes.uv.array),samples=[];
    for(const scale of [1,.5]){
        const human=await factory.create(goldenCharacters[0].dna,2,false),body=human.root.getObjectByName('UniversalHuman'),position=body.geometry.attributes.position;
        body.getVertexPosition=(index,target)=>target.fromBufferAttribute(position,index).multiplyScalar(scale);
        for(const volume of human.fit.cages.values()){volume.bounds.copy(volume.canonicalBounds).applyMatrix4(new Matrix4().makeScale(scale,scale,scale));volume.points=[];for(const x of [volume.bounds.min.x,volume.bounds.max.x])for(const y of [volume.bounds.min.y,volume.bounds.max.y])for(const z of [volume.bounds.min.z,volume.bounds.max.z])volume.points.push(new Vector3(x,y,z));}
        const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-stable-fold-gap',clearance:.001,garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}},module=fitGarment(source,metadata,body,human.fit),geometry=module.getObjectByName(mesh.name).geometry,points=geometry.attributes.position,size=new Vector3();
        assert.equal(geometry.index.count,mesh.geometry.index.count,'an already clear source ring needs no extra support topology');
        const corners=geometry=>Array.from({length:geometry.index.count},(_,i)=>{const vertex=geometry.index.getX(i);return [geometry.attributes.uv.getX(vertex),geometry.attributes.uv.getY(vertex)];}).flat();
        assert.deepEqual(corners(geometry),corners(mesh.geometry),'surface transport preserves the original indexed UV/facet assignment even when flat-shaded corner buffers are expanded');
        for(let i=0;i<points.count;i++){size.x=Math.max(size.x,Math.abs(points.getX(i)));size.y=Math.max(size.y,points.getY(i));size.z=Math.max(size.z,Math.abs(points.getZ(i)));}samples.push(size);disposeGarment(module);human.dispose();
    }
    for(const axis of ['x','y','z'])assert.ok(Math.abs(samples[1][axis]/samples[0][axis]-.5)<.002,`${axis}: an unobserved normal direction cannot retain adult fold depth during child shrink`);
    assert.ok(Math.abs(samples[0].x-.651)<1e-5&&Math.abs(samples[0].z-.651)<1e-5,'identity transport retains authored adult stand-off plus one configured clearance');
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),sourcePositions);assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),sourceUV);mesh.geometry.dispose();mesh.material.dispose();
});

test('sculpted feminine and overweight bodies cannot amplify a source garment normal gap',async()=>{
    for(const id of ['golden_feminine_01','golden_overweight_01']){
        const human=await factory.create(goldenCharacters.find(p=>p.id===id).dna,2,false),body=human.root.getObjectByName('UniversalHuman'),p=body.geometry.attributes.position,index=body.geometry.index;let face;
        for(let i=0;i<index.count;i+=3){const triangle=new Triangle(...[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,index.getX(i+k)))),centre=triangle.getMidpoint(new Vector3()),normal=triangle.getNormal(new Vector3());if(centre.y>1.03&&centre.y<1.16&&Math.abs(centre.x)<.09&&normal.z>.8){face=triangle;break;}}
        assert.ok(face,'fixture requires an actual canonical front torso support triangle');
        const normal=face.getNormal(new Vector3()),centre=face.getMidpoint(new Vector3()),points=[face.a,face.b,face.c].map(point=>point.clone().lerp(centre,.8).addScaledVector(normal,.04)),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(point=>point.toArray()),3));geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,0,1],2));geometry.setIndex([0,1,2]);const source=new Group(),mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name='technical-sculpted-normal-gap';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
        const reference=characterAsset('garment/long-dress').metadata,metadata={...reference,id:'technical-sculpted-gap-module',clearance:.005,garmentBind:{joints:Object.fromEntries(Object.keys(reference.garmentBind.joints).map(name=>[name,human.fit.canonicalJoints.get(name).toArray()]))}},install=human.installModule;let targetSurface;
        // Inspect the same neutral binding frame used by production equip.
        human.installModule=function(meta,asset){install.call(this,meta,asset);targetSurface=[];for(let i=0;i<index.count;i+=3)targetSurface.push(new Triangle(...[0,1,2].map(k=>body.getVertexPosition(index.getX(i+k),new Vector3()))));};
        const sourcePositions=Array.from(geometry.attributes.position.array),module=human.equip(metadata,source),fitted=module.getObjectByName(mesh.name).geometry.attributes.position;
        for(let i=0;i<fitted.count;i++){const point=new Vector3().fromBufferAttribute(fitted,i),distance=Math.min(...targetSurface.map(triangle=>triangle.closestPointToPoint(point,new Vector3()).distanceTo(point)));assert.ok(distance<.055,`${id}: the .04m source gap must remain bounded rather than becoming a forward cloth sail (${distance})`);}
        assert.deepEqual(Array.from(geometry.attributes.position.array),sourcePositions);assert.equal(body.geometry.index.count,sourceBodyIndexCount);human.dispose();geometry.dispose();mesh.material.dispose();
    }
});
