import { BufferGeometry, Group, Matrix4, Ray, SkinnedMesh, Triangle, Vector3 } from 'three';
import { CoverageZone } from './AttachmentContract';
import { requireValidatedBodySurfaceCalibration, ValidatedBodySurfaceCalibration } from './BodySurfaceCalibration';

export const bodyContactSurfaceVersion='pillagers-body-contact-surface/1' as const;
export type ContactPoint=readonly [number,number,number];
export interface BodySurfaceContact {
    readonly mesh:number;
    readonly triangle:number;
    readonly vertexIds:readonly [number,number,number];
    readonly point:ContactPoint;
    readonly normal:ContactPoint;
    readonly barycentric:ContactPoint;
    readonly coverage:readonly [CoverageZone,CoverageZone,CoverageZone];
}
export interface BodySurfaceQuery {
    readonly classification:'inside'|'outside'|'on-surface'|'indeterminate';
    readonly winding:number;
    /** Occupancy and distance always use the complete unmasked body. */
    readonly signedDistance:number|null;
    readonly collisionDistance:number;
    readonly collisionNearest:BodySurfaceContact;
    /** An optional semantic subset selects contact, never occupancy. */
    readonly contactDistance:number;
    readonly nearest:BodySurfaceContact;
}
export interface ContactQueryOptions {readonly contactZones?:readonly CoverageZone[];}
export interface BodyContactBatch {
    readonly sourceSHA256:string;
    readonly revision:number;
    query(point:ContactPoint,options?:ContactQueryOptions):BodySurfaceQuery;
    raycast(origin:ContactPoint,direction:ContactPoint,options?:ContactQueryOptions):Readonly<{distance:number;nearest:BodySurfaceContact}>|null;
}
export interface BodyContactSurface {
    readonly version:typeof bodyContactSurfaceVersion;
    readonly kind:'body-triangles';
    readonly sourceSHA256:string;
    readonly revision:number;
    readonly completeTriangles:number;
    readonly closed:true;
    beginQueryBatch():BodyContactBatch;
    /** Convenience audit methods. Runtime fitting should reuse one batch. */
    query(point:ContactPoint,options?:ContactQueryOptions):BodySurfaceQuery;
    raycast(origin:ContactPoint,direction:ContactPoint,options?:ContactQueryOptions):Readonly<{distance:number;nearest:BodySurfaceContact}>|null;
    evidence():Readonly<{sourceSHA256:string;revision:number;completeTriangles:number;closed:true;facets:readonly Readonly<{mesh:number;triangle:number;vertexIds:readonly number[];points:readonly ContactPoint[];normal:ContactPoint;coverage:readonly CoverageZone[]}>[]}>;
}
export interface BodyContactSurfaceOptions {
    sourceSHA256:string;
    root:Group;
    getRevision:()=>number;
    /** Internal constructor-captured originals. Rendering masks are not sources. */
    sourceGeometries?:ReadonlyMap<SkinnedMesh,BufferGeometry>;
}
interface Facet {mesh:number;triangle:number;ids:[number,number,number];points:[Vector3,Vector3,Vector3];shape:Triangle;normal:Vector3;coverage:[CoverageZone,CoverageZone,CoverageZone];bounds:readonly [number,number,number,number,number,number];}
const surfaces=new WeakSet<object>(),batches=new WeakSet<object>();
const fail=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
function tuple(value:Vector3):ContactPoint {return Object.freeze([value.x,value.y,value.z]) as ContactPoint;}
function point(value:ContactPoint,label:string){
    fail(Array.isArray(value)&&value.length===3&&Array.from(value).every(v=>typeof v==='number'&&Number.isFinite(v)),'Invalid '+label+'.');
    return new Vector3(...value);
}
function originalCorrespondence(calibration:ValidatedBodySurfaceCalibration,meshes:readonly SkinnedMesh[],originals:readonly BufferGeometry[]){
    fail(originals.length===meshes.length,'Body contact source mesh correspondence mismatch.');
    originals.forEach((geometry,mi)=>{
        const entry=calibration.meshes[mi],p=geometry.getAttribute('position'),index=geometry.index;
        fail(entry.name===meshes[mi].name&&p?.itemSize===3&&p.count*3===entry.neutralPositions.length&&index?.count===entry.triangleIndices.length,'Body contact full source topology/correspondence mismatch.');
        for(let i=0;i<p.count;i++)for(let k=0;k<3;k++)fail(p.getComponent(i,k)===entry.neutralPositions[i*3+k],'Stale body contact neutral POSITION correspondence.');
        for(let i=0;i<index!.count;i++)fail(index!.getX(i)===entry.triangleIndices[i],'Stale body contact full triangle correspondence.');
        const current=meshes[mi].geometry.getAttribute('position');
        fail(current?.itemSize===3&&current.count===p.count,'Body contact current clone POSITION correspondence mismatch.');
        for(let i=0;i<current.count;i++)for(let k=0;k<3;k++)fail(current.getComponent(i,k)===entry.neutralPositions[i*3+k],'Stale body contact current clone neutral POSITION correspondence.');
    });
}

/** Source-bound, complete-body collision authority for a neutral refit snapshot.
 * Canonical cages and sockets remain independent. A HEAD contact patch is open,
 * so only the complete closed body can determine inside/outside. No vertices are
 * projected or altered here. Caller-owned masks are deliberately ignored.
 */
export function createBodyContactSurface(calibration:ValidatedBodySurfaceCalibration,meshes:readonly SkinnedMesh[],options:BodyContactSurfaceOptions):BodyContactSurface {
    fail(/^[a-f0-9]{64}$/.test(options.sourceSHA256)&&calibration.sourceSHA256===options.sourceSHA256,'Stale body contact source SHA256.');
    fail(meshes.length>0&&(!options.sourceGeometries||options.sourceGeometries.size===meshes.length),'Body contact original source geometry map is incomplete.');
    const originals=meshes.map(mesh=>{
        const geometry=options.sourceGeometries?options.sourceGeometries.get(mesh):mesh.geometry;
        fail(geometry,'Body contact is missing a constructor-captured source geometry.');return geometry!;
    });
    // Authenticate the existing calibration brand and its exact original data.
    // These read-only validation views never replace or mutate rendered meshes.
    const sourceViews=meshes.map((mesh,i)=>{const view=new SkinnedMesh(originals[i]);view.name=mesh.name;return view;});
    requireValidatedBodySurfaceCalibration(calibration,sourceViews);
    originalCorrespondence(calibration,meshes,originals);
    const sourceSHA256=options.sourceSHA256,getRevision=options.getRevision;
    const revision=getRevision();fail(Number.isSafeInteger(revision)&&revision>=0,'Invalid body contact fit revision.');
    options.root.updateMatrixWorld(true);
    fail(options.root.matrixWorld.elements.every(Number.isFinite)&&Math.abs(options.root.matrixWorld.determinant())>1e-12,'Invalid body contact root transform.');
    const inverse=new Matrix4().copy(options.root.matrixWorld).invert(),facets:Facet[]=[];
    for(let mi=0;mi<meshes.length;mi++){
        const mesh=meshes[mi],entry=calibration.meshes[mi];mesh.skeleton.update();
        const current=Array.from({length:entry.coverage.length},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        fail(current.every(p=>p.toArray().every(Number.isFinite)),'Nonfinite current body contact surface.');
        for(let i=0;i<entry.triangleIndices.length;i+=3){
            const ids=entry.triangleIndices.slice(i,i+3) as [number,number,number],points=ids.map(id=>current[id].clone()) as [Vector3,Vector3,Vector3],shape=new Triangle(...points);
            fail(shape.getArea()>1e-12,'Degenerate current body contact triangle.');
            facets.push({mesh:mi,triangle:i/3,ids:[...ids],points,shape,normal:shape.getNormal(new Vector3()),coverage:ids.map(id=>entry.coverage[id]) as [CoverageZone,CoverageZone,CoverageZone],bounds:[Math.min(...points.map(p=>p.x)),Math.max(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.y)),Math.min(...points.map(p=>p.z)),Math.max(...points.map(p=>p.z))]});
        }
    }
    // True metric weld over neighbouring buckets. Split normal/color corners
    // retain their ordered source IDs but do not fabricate open body seams.
    const tolerance=1e-6,vertices:Vector3[]=[],parents:number[]=[],buckets=new Map<string,number[]>();
    const find=(id:number):number=>{while(parents[id]!==id){parents[id]=parents[parents[id]];id=parents[id];}return id;};
    const add=(p:Vector3)=>{
        const id=vertices.length;vertices.push(p);parents.push(id);const cell=p.toArray().map(v=>Math.floor(v/tolerance));
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const other of buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))??[])
            if(p.distanceToSquared(vertices[other])<=tolerance*tolerance)parents[find(id)]=find(other);
        const key=cell.join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(id);return id;
    };
    const pointIds=facets.map(f=>f.points.map(add)),edges=new Map<string,{count:number;orientation:number}>();
    for(const ids0 of pointIds){const ids=ids0.map(find);fail(new Set(ids).size===3,'Collapsed current body contact triangle after metric weld.');for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+','+b:b+','+a,edge=edges.get(key)??{count:0,orientation:0};edge.count++;edge.orientation+=a<b?1:-1;edges.set(key,edge);}}
    fail([...edges.values()].every(e=>e.count===2&&e.orientation===0),'Body contact authority requires a complete closed consistently oriented body surface.');
    const volume=facets.reduce((sum,f)=>sum+f.points[0].dot(f.points[1].clone().cross(f.points[2]))/6,0);
    fail(Number.isFinite(volume)&&Math.abs(volume)>1e-10,'Body contact authority lacks usable enclosed volume.');
    const orientation=Math.sign(volume);
    const epoch=()=>fail(getRevision()===revision,'Stale body contact fit revision.');
    const fresh=()=>{epoch();originalCorrespondence(calibration,meshes,originals);};
    const contact=(f:Facet,p:Vector3):BodySurfaceContact=>Object.freeze({mesh:f.mesh,triangle:f.triangle,vertexIds:Object.freeze([...f.ids]) as readonly [number,number,number],point:tuple(p),normal:tuple(f.normal.clone().multiplyScalar(orientation)),barycentric:tuple(f.shape.getBarycoord(p,new Vector3())!),coverage:Object.freeze([...f.coverage]) as readonly [CoverageZone,CoverageZone,CoverageZone]});
    const knownZones=new Set(calibration.meshes.flatMap(entry=>[...entry.coverage]));
    const zones=(value?:ContactQueryOptions)=>{
        if(!value?.contactZones)return undefined;
        fail(Array.isArray(value.contactZones)&&value.contactZones.length>0&&new Set(value.contactZones).size===value.contactZones.length,'Invalid body contact semantic zone subset.');
        fail(value.contactZones.every(zone=>knownZones.has(zone)),'Unknown or absent body contact semantic zone.');return value.contactZones;
    };
    const classify=(value:ContactPoint,queryOptions?:ContactQueryOptions):BodySurfaceQuery=>{
        const q=point(value,'body surface query'),selected=zones(queryOptions),closest=new Vector3();let nearest:BodySurfaceContact|null=null,collisionNearest:BodySurfaceContact|null=null,contactDistance=Infinity,collisionDistance=Infinity,winding=0;
        for(const f of facets){
            // Occupancy still sums every triangle of the complete closed body.
            // Scalar arithmetic avoids allocating four temporary vectors per facet.
            const ax=f.points[0].x-q.x,ay=f.points[0].y-q.y,az=f.points[0].z-q.z;
            const bx=f.points[1].x-q.x,by=f.points[1].y-q.y,bz=f.points[1].z-q.z;
            const cx=f.points[2].x-q.x,cy=f.points[2].y-q.y,cz=f.points[2].z-q.z;
            const la=Math.sqrt(ax*ax+ay*ay+az*az),lb=Math.sqrt(bx*bx+by*by+bz*bz),lc=Math.sqrt(cx*cx+cy*cy+cz*cz);
            winding+=2*Math.atan2(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx),la*lb*lc+(ax*bx+ay*by+az*bz)*lc+(bx*cx+by*cy+bz*cz)*la+(cx*ax+cy*ay+cz*az)*lb);
            const eligible=!selected||f.coverage.every(zone=>selected.includes(zone));
            // A facet's AABB only bounds nearest-distance work. It never decides
            // occupancy or substitutes for a body/head contact surface.
            const [minX,maxX,minY,maxY,minZ,maxZ]=f.bounds;
            const dx=Math.max(minX-q.x,0,q.x-maxX),dy=Math.max(minY-q.y,0,q.y-maxY),dz=Math.max(minZ-q.z,0,q.z-maxZ),lower=dx*dx+dy*dy+dz*dz;
            const collisionLimit=collisionDistance*collisionDistance,contactLimit=contactDistance*contactDistance;
            const guard=Number.EPSILON*Math.max(1,Number.isFinite(collisionLimit)?collisionLimit:0,eligible&&Number.isFinite(contactLimit)?contactLimit:0);
            if(lower>collisionLimit+guard&&(!eligible||lower>contactLimit+guard))continue;
            const p=f.shape.closestPointToPoint(q,closest),distance=p.distanceTo(q);
            const closerCollision=distance<collisionDistance,closerContact=eligible&&distance<contactDistance;
            if(closerCollision||closerContact){
                const hit=contact(f,p);
                if(closerCollision){collisionDistance=distance;collisionNearest=hit;}
                if(closerContact){contactDistance=distance;nearest=hit;}
            }
        }
        fail(nearest&&collisionNearest&&Number.isFinite(contactDistance)&&Number.isFinite(collisionDistance),'No actual body contact facets for the requested semantic region.');
        const occupied=Math.abs(winding/(4*Math.PI));fail(Number.isFinite(occupied),'Nonfinite body contact winding.');
        const classification=collisionDistance<1e-7?'on-surface':occupied<.1?'outside':occupied>.9?'inside':'indeterminate';
        return Object.freeze({classification,winding:occupied,signedDistance:classification==='indeterminate'?null:classification==='on-surface'?0:classification==='inside'?-collisionDistance:collisionDistance,collisionDistance,collisionNearest:collisionNearest!,contactDistance,nearest:nearest!});
    };
    const cast=(origin:ContactPoint,direction:ContactPoint,queryOptions?:ContactQueryOptions)=>{
        const o=point(origin,'body surface ray origin'),d=point(direction,'body surface ray direction'),selected=zones(queryOptions);fail(d.length()>1e-10,'Body surface ray direction cannot be zero.');const ray=new Ray(o,d.normalize());let nearest:BodySurfaceContact|null=null,distance=Infinity;
        for(const f of facets){if(selected&&!f.coverage.every(zone=>selected.includes(zone)))continue;const p=ray.intersectTriangle(...f.points,false,new Vector3());if(!p)continue;const delta=p.distanceTo(o);if(delta<distance){distance=delta;nearest=contact(f,p);}}
        return nearest?Object.freeze({distance,nearest}):null;
    };
    const evidence=Object.freeze({sourceSHA256,revision,completeTriangles:facets.length,closed:true as const,facets:Object.freeze(facets.map(f=>Object.freeze({mesh:f.mesh,triangle:f.triangle,vertexIds:Object.freeze([...f.ids]),points:Object.freeze(f.points.map(tuple)),normal:tuple(f.normal.clone().multiplyScalar(orientation)),coverage:Object.freeze([...f.coverage])})))});
    const surface:BodyContactSurface={version:bodyContactSurfaceVersion,kind:'body-triangles',sourceSHA256,revision,completeTriangles:facets.length,closed:true,
        beginQueryBatch(){
            requireBodyContactSurface(this);fail(this===surface,'Body contact surface instance mismatch.');fresh();
            const batch:BodyContactBatch={sourceSHA256,revision,
                query(value,queryOptions){fail(batches.has(this)&&this===batch,'Unvalidated body contact query batch.');epoch();return classify(value,queryOptions);},
                raycast(origin,direction,queryOptions){fail(batches.has(this)&&this===batch,'Unvalidated body contact query batch.');epoch();return cast(origin,direction,queryOptions);}};
            batches.add(batch);return Object.freeze(batch);
        },
        query(value,queryOptions){requireBodyContactSurface(this);fail(this===surface,'Body contact surface instance mismatch.');return this.beginQueryBatch().query(value,queryOptions);},
        raycast(origin,direction,queryOptions){requireBodyContactSurface(this);fail(this===surface,'Body contact surface instance mismatch.');return this.beginQueryBatch().raycast(origin,direction,queryOptions);},
        evidence(){requireBodyContactSurface(this);fail(this===surface,'Body contact surface instance mismatch.');return evidence;}
    };
    surfaces.add(surface);return Object.freeze(surface);
}
export function requireBodyContactSurface(value:BodyContactSurface){fail(value&&surfaces.has(value),'Body contact surface must be source-validated before fitting.');return value;}


