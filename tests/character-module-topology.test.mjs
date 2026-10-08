import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {load} from './load-source.mjs';
import {validateAssetRecord} from '../scripts/characters/validation.mjs';
const {characterAsset}=load('../src/characters/CharacterAssets.ts');

function record(points,faces){
 const positions=[],normals=[];
 for(const face of faces){const vertices=face.map(i=>new Vector3(...points[i])),normal=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();for(const vertex of vertices){positions.push(...vertex.toArray());normals.push(...normal.toArray());}}
 const position=Buffer.from(new Float32Array(positions).buffer),normal=Buffer.from(new Float32Array(normals).buffer),binary=Buffer.concat([position,normal]);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:position.length},{buffer:0,byteOffset:position.length,byteLength:normal.length}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3'},{bufferView:1,componentType:5126,count:normals.length/3,type:'VEC3'}]};
 return {json,binary};
}

test('module gate permits intentional open boundaries and coincident flat-normal seam copies',()=>{
 const source=record([[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[[0,1,2],[0,2,3]]);
 assert.equal(validateAssetRecord(characterAsset('hair/short'),2,source),2);
});

test('module gate rejects three sheets sharing one edge even with valid normals',()=>{
 const source=record([[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],[[0,1,2],[1,0,3],[0,1,4]]);
 assert.throws(()=>validateAssetRecord(characterAsset('hair/short'),2,source),/hair\/short LOD2: non-manifold edges/);
});

test('module gate rejects independent surface fans pinched at a single vertex',()=>{
 const source=record([[0,0,0],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],[[0,1,2],[0,3,4]]);
 assert.throws(()=>validateAssetRecord(characterAsset('hair/short'),2,source),/hair\/short LOD2: pinched\/disconnected vertex links/);
});
