import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSurfaceIntersections as audit,tolerances} from '../scripts/characters/surface-intersections.mjs';

const triangles=[0,1,2,3,4,5],plane=[[-1,0,-1],[1,0,-1],[0,0,1]];
test('proper surface crossings are detected with fixed metric thresholds',()=>{
    const r=audit({positions:[...plane,[0,-1,-.5],[0,1,-.5],[0,0,.8]],triangles});
    assert.equal(r.properInteriorCrossingPairs,1);
    assert.ok(Math.abs(r.properPairs[0].crossingSegmentMetres-1.3)<1e-12);
    assert.equal(r.legacyNonadjacentProperPairs,1);
    assert.equal(tolerances.properSegmentMetres,1e-5);
    assert.equal(tolerances.properPlaneStraddleMetres,1e-6);
});
test('shared source corners do not hide real interior crossings away from contact',()=>{
    const r=audit({positions:[[0,0,0],[-1,0,1],[1,0,1],[0,0,0],[0,-1,.5],[0,1,.5]],triangles,correspondenceIds:[0,1,2,0,3,4]});
    assert.equal(r.properInteriorCrossingPairs,1);
    assert.equal(r.properPairsSharingCorrespondence,1);
    assert.equal(r.legacyNonadjacentProperPairs,0);
});
test('split-attribute shared edges, separated triangles and tangent contact are not proper crossings',()=>{
    for(const positions of [
        [...plane,[0,2,-.5],[1,2,-.5],[0,2,.8]],
        [[0,0,0],[1,0,0],[0,1,0],[0,0,0],[1,0,0],[0,0,1]],
        [[0,0,0],[1,0,0],[0,1,0],[.2,.2,0],[.3,.2,1],[.2,.3,1]],
    ])assert.equal(audit({positions,triangles,correspondenceIds:[0,1,2,0,1,3]}).properInteriorCrossingPairs,0);
});
test('a zero noncoplanar count explicitly leaves coplanar overlap untested',()=>{
    const r=audit({positions:[[0,0,0],[1,0,0],[0,1,0],[.1,.1,0],[.6,.1,0],[.1,.6,0]],triangles});
    assert.equal(r.properInteriorCrossingPairs,0);
    assert.equal(r.coplanarOverlapTested,false);
    assert.equal(r.coplanarAABBPairCandidatesUntested,1);
});
test('empty and malformed inputs cannot produce a false clean-surface result',()=>{
    for(const value of [
        {positions:[],triangles:[]},
        {positions:[[NaN,0,0],[1,0,0],[0,1,0]],triangles:[0,1,2]},
        {positions:[[0,0,0],[1,0,0],[0,1,0]],triangles:[0,1,3]},
        {positions:[[0,0,0],[1,0,0],[0,1,0]],triangles:[0,1,2],correspondenceIds:[0,NaN,2]},
        {positions:[[0,0,0],[1,0,0],[0,1,0]],triangles:[0,1,2],correspondenceIds:[0,1]},
    ])assert.throws(()=>audit(value));
});
