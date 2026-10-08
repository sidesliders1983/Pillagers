import {readLocalGLB,validateVertexPaletteStyle,STYLE_FAMILY_PROFILES} from './characters/style-validation.mjs';
const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='--family'||!Object.hasOwn(STYLE_FAMILY_PROFILES,args[1])){
 console.error('Usage: npm run validate:style -- --family body-proof|diagnostic-triangle <local.glb>');process.exitCode=2;
}else{
 const family=args[1],path=args[2];
 try{
  const source=readLocalGLB(path),result=validateVertexPaletteStyle(source,STYLE_FAMILY_PROFILES[family]);
  console.log(JSON.stringify({family,path,sourceSHA256:source.sha256,...result},null,2));process.exitCode=result.valid?0:1;
 }catch(error){console.error(JSON.stringify({family,path,valid:false,error:String(error.message)}));process.exitCode=1;}
}
