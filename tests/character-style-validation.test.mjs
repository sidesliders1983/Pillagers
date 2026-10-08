import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readLocalGLB,validateVertexPaletteStyle,styleProfileHash,DEFAULT_VERTEX_PALETTE_PROFILE,STYLE_FAMILY_PROFILES} from '../scripts/characters/style-validation.mjs';
function fixture(options={}){
 const points=options.subdivide?[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,0]]:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
 const faces=options.subdivide?[[0,2,4],[2,1,4],[1,0,4],[0,1,3],[0,3,2],[1,2,3]]:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
 const positions=[],normals=[],colors=[];
 for(const [ti,face]of faces.entries()){
  const [a,b,c]=face.map(i=>points[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  for(let corner=0;corner<3;corner++){positions.push(...points[face[corner]]);normals.push(...(options.normal?.(ti,corner,n.map(x=>x/length))??n.map(x=>x/length)));colors.push(...(options.color?.(ti,corner,points[face[corner]])??[1,1,1,1]));}
 }
 const chunks=[],views=[],accessors=[];let offset=0;
 for(const [data,width,type]of [[positions,3,'VEC3'],[normals,3,'VEC3'],[colors,4,'VEC4']]){const b=Buffer.alloc(data.length*4);data.forEach((v,i)=>b.writeFloatLE(v,i*4));chunks.push(b);views.push({buffer:0,byteOffset:offset,byteLength:b.length});accessors.push({bufferView:views.length-1,componentType:5126,count:data.length/width,type});offset+=b.length;}
 const binary=Buffer.concat(chunks),json={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:views,accessors,meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},material:0,mode:4}]}],materials:[options.material??{pbrMetallicRoughness:{metallicFactor:0}}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0,...options.resources};
 const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32),header=Buffer.alloc(20),binhead=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+padding.length+binary.length,8);header.writeUInt32LE(text.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);binhead.writeUInt32LE(binary.length);binhead.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([header,text,padding,binhead,binary]);return {json,binary,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
}
function rejects(record,code,profile={},authority={}){const result=validateVertexPaletteStyle(record,profile,authority);assert.equal(result.valid,false,JSON.stringify(result));assert.ok(result.issues.some(i=>i.code===code),JSON.stringify(result.issues));return result;}
test('closed faceted binary tetra fixture passes and does not claim visual acceptance',()=>{const r=validateVertexPaletteStyle(fixture());assert.equal(r.valid,true,JSON.stringify(r.issues));assert.equal(r.diagnostics.technicalPassIsVisualAcceptance,false);assert.equal(r.diagnostics.geometryQuality.boundaryEdges,0);});
test('one varying corner is a rejected non-gradient facet',()=>rejects(fixture({color:(t,c)=>t===0&&c===1?[.4,.2,.1,1]:[1,1,1,1]}),'FACET_COLOR_VARIATION'));
test('out-of-range and nonfinite COLOR_0 are rejected',()=>{rejects(fixture({color:()=>[1.1,0,0,1]}),'COLOR_NORMALIZED');rejects(fixture({color:()=>[NaN,0,0,1]}),'ACCESSOR_INVALID');});
test('nonwhite base factor cannot multiply pure-white underlayer',()=>rejects(fixture({material:{pbrMetallicRoughness:{baseColorFactor:[.8,.8,.8,1]}}}),'MATERIAL_RGB'));
test('opacity is separate from neutral RGB',()=>rejects(fixture({material:{pbrMetallicRoughness:{baseColorFactor:[1,1,1,.5]},alphaMode:'BLEND'}}),'MATERIAL_ALPHA'));
test('vertex alpha variation violates opaque selected policy',()=>rejects(fixture({color:()=>[1,1,1,.5]}),'VERTEX_ALPHA'));
test('painted albedo and image resources are rejected even with valid COLOR_0',()=>{const r=rejects(fixture({material:{pbrMetallicRoughness:{baseColorTexture:{index:0}}},resources:{images:[{uri:'fixture.png'}],textures:[{source:0}]}}),'PAINTED_MAP_POLICY');assert.ok(r.issues.some(i=>i.code==='MATERIAL_MAP_POLICY'));});
test('normal/noise maps cannot hide under vertex colors',()=>rejects(fixture({material:{normalTexture:{index:0},extensions:{noise:{noiseTexture:{index:0}}}}}),'MATERIAL_MAP_POLICY'));
test('malformed and interpolated normals are rejected',()=>{rejects(fixture({normal:()=>[0,0,2]}),'NORMAL_UNIT');rejects(fixture({normal:(t,c,n)=>t===0&&c===0?[.1,0,-Math.sqrt(.99)]:n}),'HARD_NORMAL');rejects(fixture({normal:()=>[NaN,0,0]}),'ACCESSOR_INVALID');});
test('actual palette and triangle budgets are bounded',()=>{rejects(fixture({color:t=>t===0?[.5,.3,.2,1]:[1,1,1,1]}),'PALETTE_BUDGET',{maxColors:1});rejects(fixture(),'TRIANGLE_BUDGET',{maxTriangles:3});});
test('coplanar-region declaration rejects color changes across actual same-plane subdivisions',()=>{const f=fixture({subdivide:true,color:t=>t===1?[.5,.3,.2,1]:[1,1,1,1]});const strict=rejects(f,'COPLANAR_COLOR_DISCONTINUITY',{facetUnit:'coplanar-region'});assert.ok(strict.diagnostics.coplanarColorDiscontinuities>0);const triangle=validateVertexPaletteStyle(f,{facetUnit:'triangle'});assert.equal(triangle.valid,true);assert.ok(triangle.warnings.some(w=>w.code==='COPLANAR_COLOR_DIAGNOSTIC'));});
test('global gradient boolean is never a bypass',()=>rejects(fixture(),'GRADIENT_BYPASS',{allowGradients:true}));
const gradient={mesh:0,primitive:0,triangles:[0],axis:0,fromMetres:0,toMetres:1,startRGBA:[0,0,0,1],endRGBA:[1,1,1,1]};
const gradientFixture=()=>fixture({color:(t,c,p)=>t===0?[p[0],p[0],p[0],1]:[1,1,1,1]});
test('unreviewed exact gradient declaration is rejected',()=>rejects(gradientFixture(),'GRADIENT_UNREVIEWED',{gradientRegions:[gradient]}));
test('only exact reviewed source/profile hashes permit a declared mathematical gradient',()=>{const f=gradientFixture(),p={...DEFAULT_VERTEX_PALETTE_PROFILE,gradientRegions:[gradient]},authority={reviewedGradientProfiles:[{profileHash:styleProfileHash(p),sourceSHA256:f.sha256,status:'approved',evidence:'test-only reviewed declaration fixture'}]};const r=validateVertexPaletteStyle(f,p,authority);assert.equal(r.valid,true,JSON.stringify(r.issues));const changed=fixture({color:(t,c,pos)=>t===0&&c===0?[.2,0,0,1]:t===0?[pos[0],pos[0],pos[0],1]:[1,1,1,1]});rejects(changed,'GRADIENT_UNREVIEWED',p,authority);const authorityForChanged={reviewedGradientProfiles:[{...authority.reviewedGradientProfiles[0],sourceSHA256:changed.sha256}]};rejects(changed,'GRADIENT_VALUE',p,authorityForChanged);});
test('gradient scope cannot reference absent triangles or silently span whole asset',()=>{const f=fixture(),p={...DEFAULT_VERTEX_PALETTE_PROFILE,gradientRegions:[{...gradient,triangles:[999]}]},authority={reviewedGradientProfiles:[{profileHash:styleProfileHash(p),sourceSHA256:f.sha256,status:'approved',evidence:'negative scope fixture'}]};rejects(f,'GRADIENT_SCOPE',p,authority);});

test('empty authored and active-scene geometry cannot pass structural style checks',()=>{
 rejects(fixture({resources:{meshes:[],nodes:[],scenes:[{nodes:[]}]}}),'EMPTY_AUTHORED_GEOMETRY');
 for(const resources of [{scenes:[{nodes:[]}]},{nodes:[{}],scenes:[{nodes:[0]}]},{nodes:[],scenes:[{nodes:[]}]},{meshes:[{primitives:[]}]}])rejects(fixture({resources}),'EMPTY_RENDERED_GEOMETRY');
});
test('active scene references and cycles are rejected rather than using an authored-mesh fallback',()=>{
 for(const resources of [{scene:99},{scenes:[]},{scenes:[{nodes:[99]}]},{nodes:[{mesh:0,children:[0]}]},{nodes:[{mesh:99}]}])rejects(fixture({resources}),'SCENE_INVALID');
});
test('strict tolerance bounds reject attempts to bypass facet colors and normals',()=>{
 for(const declaration of [{colorTolerance:1},{colorTolerance:1e-5},{hardNormalMinDot:0},{hardNormalMinDot:.99},{normalLengthTolerance:10},{coplanarAngleDegrees:360},{coplanarPlaneDistanceMetres:100},{coplanarAngleDegrees:0},{coplanarPlaneDistanceMetres:0}])rejects(fixture(),'PROFILE_INVALID',declaration);
 rejects(fixture({color:(t,c)=>t===0&&c===1?[.4,.2,.1,1]:[1,1,1,1]}),'PROFILE_INVALID',{colorTolerance:1});
 rejects(fixture({normal:(t,c,n)=>t===0&&c===0?[.1,0,-Math.sqrt(.99)]:n}),'PROFILE_INVALID',{hardNormalMinDot:0});
});
test('boolean, id, budget and unknown profile fields require exact controlled types',()=>{
 for(const declaration of [{opaque:'false'},{opaque:0},{opaque:null},{closedTopology:'false'},{closedTopology:1},{id:0},{id:''},{maxTriangles:10001},{maxRenderVertices:30001},{maxMaterials:3},{maxColors:17},{maxTriangles:0},{facetUnit:true},{gradientRegions:null},{constructor:1},JSON.parse('{"__proto__":0}')])rejects(fixture(),'PROFILE_INVALID',declaration);
 for(const declaration of [null,[],false])rejects(fixture(),'PROFILE_INVALID',declaration);
 assert.equal(validateVertexPaletteStyle(fixture(),{colorTolerance:0,normalLengthTolerance:1e-5,hardNormalMinDot:.999999}).valid,true,'tightening remains possible within strict bounds');
});
test('rendered instances count against family triangle and vertex budgets',()=>{
 const f=fixture({resources:{nodes:[{mesh:0},{mesh:0,translation:[2,0,0]}],scenes:[{nodes:[0,1]}]}});
 const r=rejects(f,'TRIANGLE_BUDGET',{maxTriangles:4,maxRenderVertices:12});
 assert.equal(r.diagnostics.authoredTriangles,4);assert.equal(r.diagnostics.renderedTriangles,8);assert.equal(r.diagnostics.renderVertices,24);assert.ok(r.issues.some(issue=>issue.code==='VERTEX_BUDGET'));
});
test('decoded fields and source hashes must still match actual binary GLB bytes',()=>{
 const altered=fixture();altered.json.materials[0].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];rejects(altered,'RECORD_INVALID');
 const wrongHash=fixture();wrongHash.sha256='0'.repeat(64);rejects(wrongHash,'RECORD_INVALID');
 const truncated=fixture();truncated.bytes=truncated.bytes.subarray(0,truncated.bytes.length-4);rejects(truncated,'RECORD_INVALID');
});
test('gradient scopes and review authority cannot be spoofed by source extras or malformed records',()=>{
 const f=fixture({color:(t,c,p)=>t===0?[p[0],p[0],p[0],1]:[1,1,1,1],resources:{extras:{reviewedGradientProfiles:[{status:'approved',sourceSHA256:'0'.repeat(64),profileHash:'0'.repeat(64),evidence:'untrusted GLB self-approval'}]}}});
 rejects(f,'GRADIENT_UNREVIEWED',{gradientRegions:[gradient]});
 for(const declaration of [{gradientRegions:[null]},{gradientRegions:[{...gradient,mesh:-1}]},{gradientRegions:[{...gradient,triangles:[0,0]}]},{gradientRegions:[{...gradient,approved:true}]}])rejects(f,'GRADIENT_DECLARATION',declaration);
 rejects(f,'AUTHORITY_INVALID',{gradientRegions:[gradient]},{reviewedGradientProfiles:true});
});
test('binary reader and CLI use controlled body-proof budgets and separate conditional diagnostics',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pillagers-style-validation-')),path=join(dir,'fixture.glb');
 try{
  writeFileSync(path,fixture().bytes);assert.equal(readLocalGLB(path).sha256,fixture().sha256);
  const command=new URL('../scripts/validate-character-style.mjs',import.meta.url);
  const run=args=>spawnSync(process.execPath,[command.pathname.replace(/^\/([A-Za-z]:)/,'$1'),...args],{encoding:'utf8'});
  const strict=run(['--family','body-proof',path]);assert.equal(strict.status,0,strict.stderr);const proof=JSON.parse(strict.stdout);assert.equal(proof.valid,true);assert.equal(proof.qualification,'technical-only');assert.equal(proof.diagnostics.profileHash,styleProfileHash(STYLE_FAMILY_PROFILES['body-proof']));
  assert.equal(STYLE_FAMILY_PROFILES['body-proof'].maxTriangles,1600);assert.equal(STYLE_FAMILY_PROFILES['body-proof'].maxRenderVertices,4800);assert.equal(STYLE_FAMILY_PROFILES['body-proof'].maxMaterials,1);assert.equal(STYLE_FAMILY_PROFILES['body-proof'].facetUnit,'coplanar-region');
  const diagnostic=run(['--family','diagnostic-triangle',path]);assert.equal(diagnostic.status,0);assert.equal(JSON.parse(diagnostic.stdout).qualification,'conditional-diagnostic');
  for(const args of [['--family','unknown',path],['--family','body-proof',path,'--color-tolerance','1'],[path]])assert.equal(run(args).status,2,'no arbitrary CLI policy or tolerance override');
  writeFileSync(path,fixture({color:(t,c)=>t===0&&c===1?[.4,.2,.1,1]:[1,1,1,1]}).bytes);const invalid=run(['--family','body-proof',path]);assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).valid,false);
 }finally{unlinkSync(path);rmdirSync(dir);}
});

test('missing COLOR_0 fails style policy without falsely reporting that real geometry is empty',()=>{
 const f=fixture({resources:{meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0,mode:4}]}]}}),r=rejects(f,'ACCESSOR_INVALID');
 assert.equal(r.diagnostics.authoredTriangles,4);assert.equal(r.diagnostics.renderedTriangles,4);assert.equal(r.diagnostics.renderVertices,12);
 assert.ok(!r.issues.some(issue=>issue.code==='EMPTY_AUTHORED_GEOMETRY'||issue.code==='EMPTY_RENDERED_GEOMETRY'));
});
