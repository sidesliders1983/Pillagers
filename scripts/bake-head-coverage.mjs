import {bakeHeadCoverage} from './characters/head-coverage-authoring.mjs';

// Geometry is always derived from native pigment-selected source facets and the
// actual canonical HEAD cages. No runtime exception or painted contour is used.
const [source,output,name='Head_coverage_LOD2',style='coverage']=process.argv.slice(2);
if(!source||!output)throw new Error('Usage: node scripts/bake-head-coverage.mjs source.glb output.glb [moduleName] [style]');
console.log(JSON.stringify(await bakeHeadCoverage({source,output,moduleName:name,style})));
