import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGeometryQuality} from '../scripts/characters/geometry-quality.mjs';
function record(points,normals,indices){
    const rows=[points.flat(),normals.flat(),indices],chunks=rows.map(row=>Buffer.from(new Float32Array(row).buffer));let offset=0;
    const bufferViews=chunks.map(chunk=>{const view={buffer:0,byteOffset:offset,byteLength:chunk.length};offset+=chunk.length;return view;});
    return {binary:Buffer.concat(chunks),json:{bufferViews,accessors:rows.map((row,i)=>({bufferView:i,count:i===2?row.length:row.length/3,type:i===2?'SCALAR':'VEC3',componentType:5126})),meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2}]}]}};
}
const points=[[0,0,0],[1,0,0],[1,1,0],[0,0,0],[1,1,0],[0,1,0]],normals=points.map(()=>[0,0,1]);
function combined(parts){
    let binaryOffset=0;const output={json:{bufferViews:[],accessors:[],meshes:[],nodes:[],scenes:[{nodes:[0]}]},chunks:[]};
    output.json.nodes.push({children:parts.map((_,index)=>index+1),translation:[2,3,4],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2],scale:[2,2,2]});
    for(const [index,{source,translation=[0,0,0],region}] of parts.entries()){
        const viewOffset=output.json.bufferViews.length,accessorOffset=output.json.accessors.length;
        output.json.bufferViews.push(...source.json.bufferViews.map(view=>({...view,byteOffset:view.byteOffset+binaryOffset})));
        output.json.accessors.push(...source.json.accessors.map(accessor=>({...accessor,bufferView:accessor.bufferView+viewOffset})));
        output.json.meshes.push({primitives:source.json.meshes[0].primitives.map(primitive=>({...primitive,attributes:Object.fromEntries(Object.entries(primitive.attributes).map(([name,id])=>[name,id+accessorOffset])),indices:primitive.indices+accessorOffset}))});
        output.json.nodes.push({mesh:index,name:`region_${index}`,translation,extras:{garmentRegion:region}});output.chunks.push(source.binary);binaryOffset+=source.binary.length;
    }
    return {json:output.json,binary:Buffer.concat(output.chunks)};
}
test('geometry audit welds UV/faceted vertex copies for seam evidence',()=>{
    const quality=inspectGeometryQuality(record(points,normals,[0,1,2,3,4,5]));
    assert.equal(quality.components,1);assert.equal(quality.boundaryEdges,4);assert.equal(quality.nonManifoldEdges,0);assert.equal(quality.nonManifoldVertices,0);
    for(const key of ['unusedVertices','degenerateTriangles','duplicateTriangles','invalidNormals','opposedNormals'])assert.equal(quality[key],0,key);
});
test('geometry audit identifies unused/degenerate/duplicate faces and bad shading',()=>{
    const quality=inspectGeometryQuality(record([...points,[9,9,9]], [...normals,[0,0,0]],[0,1,2,3,4,5,0,1,2,0,0,1]));
    assert.equal(quality.unusedVertices,1);assert.equal(quality.degenerateTriangles,1);assert.equal(quality.duplicateTriangles,1);assert.equal(quality.invalidNormals,1);
    const inverted=inspectGeometryQuality(record(points,normals.map(normal=>normal.map(v=>-v)),[0,1,2,3,4,5]));assert.equal(inverted.opposedNormals,2);
});
test('geometry evidence joins semantic regions in their actual ancestor/node transform frame',()=>{
    const first=record([[0,0,0],[1,0,0],[1,1,0]],Array(3).fill([0,0,1]),[0,1,2]),second=record([[0,0,0],[0,1,0],[-1,1,0]],Array(3).fill([0,0,1]),[0,1,2]);
    const quality=inspectGeometryQuality(combined([{source:first,region:'cloth'},{source:second,region:'skirt',translation:[1,0,0]}]));
    assert.equal(quality.components,1);assert.equal(quality.boundaryEdges,4);assert.equal(quality.nonManifoldEdges,0);
    const component=quality.componentDetails[0];assert.equal(component.vertices,4);assert.equal(component.triangles,2);assert.ok(Math.abs(component.area-4)<1e-12);assert.deepEqual(component.regions,['cloth','skirt']);
    for(const [key,expected] of [['min',[2,3,4]],['max',[4,3,6]]])component.bounds[key].forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-12));
});
test('metric seam welding handles copies on opposite bucket boundaries',()=>{
    // Values must remain distinct after glTF Float32 encoding and the parent scale.
    for(const [a,b] of [[1.00000065,1.00000085],[1.00000045,1.00000055]]){
        const first=record([[0,0,0],[a,0,0],[a,1,0]],Array(3).fill([0,0,1]),[0,1,2]);
        const second=record([[b,0,0],[b,1,0],[0,1,0]],Array(3).fill([0,0,1]),[0,1,2]);
        const quality=inspectGeometryQuality(combined([{source:first},{source:second}]));
        assert.equal(quality.components,1);assert.equal(quality.boundaryEdges,4);assert.equal(quality.componentDetails[0].vertices,4);
        assert.equal(quality.nonManifoldVertices,0,'coincident seam copies formed a false pinched vertex');
        const separated=inspectGeometryQuality(combined([{source:first},{source:second}]),{weldTolerance:1e-8});assert.equal(separated.components,2);
    }
});
test('disconnected component evidence distinguishes a tiny floating fragment by area and bounds',()=>{
    const main=record([[0,0,0],[1,0,0],[0,1,0]],Array(3).fill([0,0,1]),[0,1,2]),fragment=record([[0,0,0],[.0001,0,0],[0,.0001,0]],Array(3).fill([0,0,1]),[0,1,2]);
    const quality=inspectGeometryQuality(combined([{source:main,region:'cloth'},{source:fragment,translation:[10,0,0],region:'mantle'}]));
    assert.equal(quality.components,2);const [body,speck]=quality.componentDetails;assert.equal(body.triangles,1);assert.equal(speck.vertices,3);assert.ok(speck.area<body.area*.000001);assert.ok(speck.bounds.min[0]>20);assert.deepEqual(speck.regions,['mantle']);
});
test('shared position accessors across material primitives do not create false unused vertices',()=>{
    const source=record([[0,0,0],[1,0,0],[1,1,0],[0,1,0]],Array(4).fill([0,0,1]),[0,1,2,0,2,3]);
    source.json.accessors[2].count=3;source.json.accessors.push({...source.json.accessors[2],byteOffset:12});
    source.json.meshes[0].primitives.push({...source.json.meshes[0].primitives[0],indices:3});
    const quality=inspectGeometryQuality(source);assert.equal(quality.vertices,4);assert.equal(quality.unusedVertices,0);assert.equal(quality.components,1);assert.equal(quality.boundaryEdges,4);
});
test('vertex-link evidence accepts an open disk and a closed manifold',()=>{
    const disk=record([[0,0,0],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],Array(5).fill([0,0,1]),[0,1,2,0,2,3,0,3,4,0,4,1]);
    const open=inspectGeometryQuality(disk);assert.equal(open.boundaryEdges,4);assert.equal(open.nonManifoldVertices,0);assert.deepEqual(open.vertexLinkDetails,[]);
    const tetra=record([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],Array(4).fill([0,0,1]),[0,2,1,0,1,3,0,3,2,1,2,3]);
    const closed=inspectGeometryQuality(tetra);assert.equal(closed.boundaryEdges,0);assert.equal(closed.nonManifoldEdges,0);assert.equal(closed.nonManifoldVertices,0);
});
test('vertex-link evidence catches two closed fans touching only at a point',()=>{
    const vertices=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[-1,0,0],[0,-1,0],[0,0,-1]],indices=[0,2,1,0,1,3,0,3,2,1,2,3,0,4,5,0,6,4,0,5,6,4,6,5];
    const quality=inspectGeometryQuality(record(vertices,Array(7).fill([0,0,1]),indices));
    assert.equal(quality.nonManifoldEdges,0);assert.equal(quality.boundaryEdges,0);assert.equal(quality.nonManifoldVertices,1);
    const link=quality.vertexLinkDetails[0];assert.deepEqual(link.position,[0,0,0]);assert.equal(link.linkComponentCount,2);assert.equal(link.boundaryEdges,0);assert.deepEqual(link.linkComponents.map(c=>c.degreeHistogram),[{2:3},{2:3}]);assert.equal(quality.componentDetails[0].nonManifoldVertices,1);
});
test('vertex-link evidence catches a bow-tie boundary without treating open seams as invalid',()=>{
    const vertices=[[0,0,0],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],quality=inspectGeometryQuality(record(vertices,Array(5).fill([0,0,1]),[0,1,2,0,3,4]));
    assert.equal(quality.nonManifoldEdges,0);assert.equal(quality.nonManifoldVertices,1);assert.equal(quality.boundaryEdges,6);
    const link=quality.vertexLinkDetails[0];assert.equal(link.linkComponentCount,2);assert.equal(link.boundaryEdges,4);assert.deepEqual(link.linkComponents.map(c=>c.degreeHistogram),[{1:2},{1:2}]);assert.ok(link.reasons.includes('disconnected vertex fans'));
});
test('vertex-link evidence welds coincident region/UV copies into one valid fan',()=>{
    const first=record([[0,0,0],[1,0,0],[1,1,0]],Array(3).fill([0,0,1]),[0,1,2]),second=record([[0,0,0],[1,1,0],[0,1,0]],Array(3).fill([0,0,1]),[0,1,2]);
    const quality=inspectGeometryQuality(combined([{source:first,region:'cloth'},{source:second,region:'skirt'}]));
    assert.equal(quality.nonManifoldVertices,0);assert.equal(quality.componentDetails[0].vertices,4);assert.deepEqual(quality.vertexLinkDetails,[]);
});
