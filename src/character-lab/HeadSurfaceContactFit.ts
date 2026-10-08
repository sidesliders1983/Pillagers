import {Box3,Mesh,Triangle,Vector3} from 'three';
import {BodyContactSurface,BodyContactBatch,requireBodyContactSurface} from '../characters/BodyContactSurface';
export type HeadCollisionAuthority={kind:'body-triangles';surface:BodyContactSurface;centre:Vector3}|{kind:'legacy-convex'};
type Facet={points:Vector3[];normal:Vector3;box:Box3;triangle:Triangle};
function finiteVector(value:Vector3,label:string,positive=false){
    if(!value?.isVector3||![value.x,value.y,value.z].every(n=>Number.isFinite(n)&&(!positive||n>0)))throw new Error('Invalid '+label+' for actual head contact.');
}
function validClearance(clearance:number){if(!Number.isFinite(clearance)||clearance<0)throw new Error('Invalid actual head contact clearance.');}
export function validateHeadCollisionAuthority(authority:HeadCollisionAuthority){
    if(!authority||typeof authority!=='object'||Array.isArray(authority)||!['body-triangles','legacy-convex'].includes(authority.kind))throw new Error('Invalid explicit head collision authority; no implicit legacy downgrade.');
    if(authority.kind==='body-triangles'){requireBodyContactSurface(authority.surface);finiteVector(authority.centre,'head centre');}
}
// Same strict interior/segment/plane thresholds as the source audit. Shared
// render corners do not suppress a crossing away from their common point/edge.
function strictHit(a:Vector3,b:Vector3,facet:Facet,strict=true){
    const direction=b.clone().sub(a),e1=facet.points[1].clone().sub(facet.points[0]),e2=facet.points[2].clone().sub(facet.points[0]),p=direction.clone().cross(e2),det=e1.dot(p);if(Math.abs(det)<1e-10)return null;
    const s=a.clone().sub(facet.points[0]),u=s.dot(p)/det,q=s.clone().cross(e1),v=direction.dot(q)/det,t=e2.dot(q)/det;
    const eps=strict?1e-6:-1e-7;return u>eps&&v>eps&&u+v<1-eps&&t>eps&&t<1-eps?a.clone().addScaledVector(direction,t):null;
}
function facet(points:Vector3[]):Facet{const triangle=new Triangle(points[0],points[1],points[2]);return{points,triangle,normal:triangle.getNormal(new Vector3()),box:new Box3().setFromPoints(points)};}
const straddle=(d:number[])=>Math.min(Math.max(0,...d),Math.max(0,...d.map(v=>-v)));
function properCrossing(a:Facet,b:Facet){
    if(!a.box.intersectsBox(b.box))return false;
    const da=a.points.map(p=>b.normal.dot(p.clone().sub(b.points[0]))),db=b.points.map(p=>a.normal.dot(p.clone().sub(a.points[0])));
    if(straddle(da)<=1e-6||straddle(db)<=1e-6)return false;
    if(![0,1,2].some(k=>strictHit(a.points[k],a.points[(k+1)%3],b)||strictHit(b.points[k],b.points[(k+1)%3],a)))return false;
    const hits:Vector3[]=[];for(let k=0;k<3;k++){const x=strictHit(a.points[k],a.points[(k+1)%3],b,false),y=strictHit(b.points[k],b.points[(k+1)%3],a,false);if(x)hits.push(x);if(y)hits.push(y);}
    return hits.some(x=>hits.some(y=>x.distanceTo(y)>1e-5));
}
function coplanarOverlap(a:Facet,b:Facet){
    if(!a.box.intersectsBox(b.box)||a.normal.clone().cross(b.normal).length()>1e-10||b.points.some(p=>Math.abs(a.normal.dot(p.clone().sub(a.points[0])))>1e-8))return false;
    const drop=a.normal.toArray().map(Math.abs).indexOf(Math.max(...a.normal.toArray().map(Math.abs))),project=(p:Vector3)=>p.toArray().filter((_,k)=>k!==drop),area=(p:number[][])=>p.reduce((s,v,i)=>{const q=p[(i+1)%p.length];return s+v[0]*q[1]-v[1]*q[0];},0)/2;
    let polygon=a.points.map(project);const clip=b.points.map(project),sign=Math.sign(area(clip));
    for(let k=0;k<3;k++){const x=clip[k],y=clip[(k+1)%3],side=(p:number[])=>sign*((y[0]-x[0])*(p[1]-x[1])-(y[1]-x[1])*(p[0]-x[0])),next:number[][]=[];for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=side(p),dq=side(q),insideP=dp>=-1e-12,insideQ=dq>=-1e-12;if(insideP)next.push(p);if(insideP!==insideQ){const t=dp/(dp-dq);next.push(p.map((v,j)=>v+t*(q[j]-v)));}}polygon=next;if(!polygon.length)return false;}
    return Math.abs(area(polygon))>1e-10;
}
/** One owned source installation, in head-centred authoring-root metres.
 * One coherent radial map acts on the complete source shell,
 * including its inner/outer layers and split copies. Native source planes are
 * bent by the fitted vertex map; existing topology, facet corners and attributes
 * remain. No independent point push,
 * hull replacement, topology change or body mutation occurs. Actual triangle
 * body/self checks gate the atomic commit; this is not style/fit acceptance. */
export function headSurfaceFitter(surface:BodyContactSurface,centre:Vector3,size:Vector3){
    requireBodyContactSurface(surface);finiteVector(centre,'head centre');finiteVector(size,'head size',true);const batch:BodyContactBatch=surface.beginQueryBatch(),origin=centre.clone(),maximum=.25*Math.min(size.x,size.y,size.z);
    const facets:Facet[]=surface.evidence().facets.map(f=>{const points=f.points.map(p=>new Vector3(...p));return{points,normal:new Vector3(...f.normal),box:new Box3().setFromPoints(points),triangle:new Triangle(points[0],points[1],points[2])};});
    const correction=(local:Vector3,clearance:number,mode:'outward'|'shell'='outward')=>{
        finiteVector(local,'head point');validClearance(clearance);if(mode!=='outward'&&mode!=='shell')throw new Error('Invalid head contact projection mode.');
        const p=local.clone().add(origin),q=batch.query(p.toArray() as [number,number,number],{contactZones:['HEAD']});
        if(q.classification==='indeterminate')throw new Error('Indeterminate actual body contact cannot be treated as clear space.');
        if(mode==='outward'&&q.classification==='outside'&&q.collisionDistance>=clearance-1e-7)return new Vector3();
        const contact=mode==='shell'?q.nearest:q.collisionNearest,delta=new Vector3(...contact.point).addScaledVector(new Vector3(...contact.normal),clearance).sub(p);
        if(delta.length()>maximum)throw new Error('Head source requires excessive actual-surface correction; revise its measured source fit.');return delta;
    };
    const clearMeshes=(meshes:readonly Mesh[],minimumY:number,maximumY:number,clearance:number)=>{
        surface.beginQueryBatch(); // Reject a stale captured body before source writes.
        validClearance(clearance);if(Number.isNaN(minimumY)||Number.isNaN(maximumY)||minimumY>maximumY)throw new Error('Invalid head attachment band.');
        if(!meshes.length)throw new Error('Missing head source shell.');
        const records=meshes.map(mesh=>{
            const target=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;if(!target||target.itemSize!==3||target.count%1)throw new Error('Invalid head source positions.');
            const count=index?.count??target.count;if(!count||!target.count||count%3)throw new Error('Invalid head source triangle count.');
            const original=Array.from({length:target.count},(_,i)=>new Vector3().fromBufferAttribute(target,i));original.forEach(p=>finiteVector(p,'head source point'));
            const indices=Array.from({length:count/3},(_,t)=>[0,1,2].map(k=>index?index.getX(t*3+k):t*3+k));if(indices.some(t=>t.some(i=>!Number.isInteger(i)||i<0||i>=original.length)))throw new Error('Invalid head source triangle index.');
            return{mesh,target,original,indices,position:target.clone()};
        });
        // Reserve the RN Float32 error before the final grid step reaches the
        // correction limit. Component targets are bounded by |p_k|+maximum;
        // 2^-24 is Float32 unit roundoff, 2^-150 covers subnormals. A Double
        // arithmetic reserve covers the radial calculation and distance check.
        // The emitted-position guard below remains exact and unchanged.
        const finalStepRoundingMargin=records.reduce((margin,r)=>r.original.reduce((m,p)=>Math.max(m,Math.hypot(...p.toArray().map(x=>2**-24*(Math.abs(x)+maximum)+2**-150))+32*Number.EPSILON*(p.length()+maximum)),margin),0);
        const inBand=(p:Vector3)=>p.y>=minimumY&&p.y<=maximumY;
        const mappedFacets=()=>records.flatMap(r=>r.indices.map(ids=>{const local=ids.map(i=>new Vector3().fromBufferAttribute(r.position,i));return{facet:facet(local.map(p=>p.clone().add(origin))),local};}));
        const selfPairs=(rows:ReturnType<typeof mappedFacets>)=>{let count=0;for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(properCrossing(rows[i].facet,rows[j].facet)||coplanarOverlap(rows[i].facet,rows[j].facet))count++;return count;};
        if(mappedFacets().some(row=>row.facet.triangle.getArea()<1e-12))throw new Error('Degenerate head source shell cannot be fitted.');
        if(selfPairs(mappedFacets()))throw new Error('Head source shell has proper self crossings; atomic contact fitting rejected.');
        let lastBody=0,lastSelf=0;
        // r -> r + delta is shared by the complete source shell. It keeps
        // directions and the distance between nested points on a ray, rather
        // than sending inner/outer corners independently to nearest contacts.
        // The piecewise linear result still needs both actual crossing audits.
        for(let pass=0;pass<=8;pass++){
            const delta=pass===8?Math.max(0,maximum-finalStepRoundingMargin):maximum*pass/8;
            for(const r of records)for(let i=0;i<r.original.length;i++){const p=r.original[i].clone();if(delta){if(p.length()<1e-8)throw new Error('Head source requires excessive actual-surface correction; revise its measured source fit.');p.addScaledVector(p.clone().normalize(),delta);}r.position.setXYZ(i,p.x,p.y,p.z);}
            if(records.some(r=>r.original.some((p,i)=>new Vector3().fromBufferAttribute(r.position,i).distanceTo(p)>maximum)))continue;
            const rows=mappedFacets();if(rows.some(row=>row.facet.triangle.getArea()<1e-12))continue;let bodyPairs=0,unsafePoints=0;
            for(const row of rows)for(const body of facets)if(properCrossing(row.facet,body)||coplanarOverlap(row.facet,body))bodyPairs++;
            const queried=new Map<string,ReturnType<BodyContactBatch['query']>>();
            for(const r of records)for(let i=0;i<r.original.length;i++){
                const p=new Vector3().fromBufferAttribute(r.position,i),key=p.toArray().join(',');let q=queried.get(key);
                if(!q){q=batch.query(p.clone().add(origin).toArray() as [number,number,number],{contactZones:['HEAD']});queried.set(key,q);}
                if(q.classification==='indeterminate')throw new Error('Indeterminate actual body contact cannot be treated as clear space.');
                if(q.classification==='inside'||q.classification==='on-surface'||inBand(r.original[i])&&q.collisionDistance<clearance-1e-7)unsafePoints++;
            }
            const self=selfPairs(rows);lastBody=bodyPairs;lastSelf=self;
            if(bodyPairs||unsafePoints||self)continue;
            surface.beginQueryBatch(); // Reauthenticate the captured epoch before the atomic commit.
            for(const r of records){for(let i=0;i<r.target.count;i++)r.target.setXYZ(i,r.position.getX(i),r.position.getY(i),r.position.getZ(i));r.target.needsUpdate=true;r.mesh.geometry.computeVertexNormals();r.mesh.geometry.computeBoundingSphere();r.mesh.userData.headContactFit={method:'coherent-source-radial-offset',sourceTriangles:rows.length,properBodyCrossings:0,properSelfCrossings:0,coplanarOverlapTested:true,radialOffsetMetres:delta,maximumCorrectionMetres:maximum,visualAcceptance:false};}
            return;
        }
        throw new Error('Head source still crosses the actual body or itself after bounded coherent contact fitting ('+lastBody+' body pairs, '+lastSelf+' self pairs); source silhouette correction limit retained.');
    };
    return {
        project(local:Vector3,clearance:number,mode:'outward'|'shell'='outward'){return local.add(correction(local,clearance,mode));},
        clearMeshes,
        clearTriangles(mesh:Mesh,minimumY:number,maximumY:number,clearance:number){return clearMeshes([mesh],minimumY,maximumY,clearance);}
    };
}


