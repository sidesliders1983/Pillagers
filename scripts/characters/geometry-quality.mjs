import {Matrix4,Quaternion,Vector3} from 'three';
import {accessorValues} from './glb-inspection.mjs';

function unionFind(){
    const parents=[];
    const find=id=>{while(parents[id]!==id){parents[id]=parents[parents[id]];id=parents[id];}return id;};
    return {add(){const id=parents.length;parents.push(id);return id;},find,join(a,b){parents[find(b)]=find(a);}};
}

/** Actual active-scene instances, including ancestor transforms. */
function meshInstances(json){
    if(!json.nodes?.length)return (json.meshes??[]).map((mesh,index)=>({mesh,matrix:new Matrix4(),name:mesh.name??`mesh_${index}`}));
    const instances=[],children=new Set(json.nodes.flatMap(node=>node.children??[]));
    const roots=json.scenes?.[json.scene??0]?.nodes??json.nodes.map((_,index)=>index).filter(index=>!children.has(index));
    const walk=(id,parent)=>{
        const node=json.nodes[id],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1]))),matrix=parent.clone().multiply(local);
        if(node.mesh!==undefined)instances.push({mesh:json.meshes[node.mesh],matrix,name:node.name??`mesh_${node.mesh}`,region:node.extras?.garmentRegion});
        for(const child of node.children??[])walk(child,matrix);
    };
    for(const root of roots)walk(root,new Matrix4());return instances;
}

/** Inspect authored topology in the rendered scene frame, without treating
 * semantic region, UV or flat-normal splits as loose seams. Positional welds use
 * a true metric tolerance across neighbouring spatial buckets; rounded keys
 * alone can separate almost-identical seam copies at a bucket boundary.
 * Open hems/hairlines and separate braid ties remain review evidence. A valid
 * vertex link is one cycle (interior) or one path (open boundary); disconnected
 * fans touching at one point are diagnosed even when every edge is manifold.
 */
export function inspectGeometryQuality(record,{weldTolerance=1e-6}={}){
    if(!Number.isFinite(weldTolerance)||weldTolerance<=0)throw new Error('Geometry weld tolerance must be positive.');
    const {json,binary}=record,result={vertices:0,triangles:0,unusedVertices:0,degenerateTriangles:0,duplicateTriangles:0,invalidNormals:0,opposedNormals:0,boundaryEdges:0,nonManifoldEdges:0,nonManifoldVertices:0,vertexLinkDetails:[],components:0,componentDetails:[]};
    const weld=unionFind(),buckets=new Map(),points=[],triangles=[],toleranceSquared=weldTolerance*weldTolerance;
    const addPoint=point=>{
        const id=weld.add();points.push(point);const cell=point.map(value=>Math.floor(value/weldTolerance));
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
            const neighbour=buckets.get(`${cell[0]+x},${cell[1]+y},${cell[2]+z}`);
            for(const other of neighbour??[])if(point.reduce((sum,value,k)=>sum+(value-points[other][k])**2,0)<=toleranceSquared)weld.join(id,other);
        }
        const key=cell.join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
    };
    for(const instance of meshInstances(json)){
        const pools=new Map();
        for(const primitive of instance.mesh.primitives){
            const accessor=primitive.attributes.POSITION;
            let pool=pools.get(accessor);
            if(!pool){
                const local=accessorValues(json,binary,accessor),world=local.map(point=>new Vector3(...point).applyMatrix4(instance.matrix).toArray());
                pool={local,world,ids:world.map(addPoint),used:new Set()};pools.set(accessor,pool);result.vertices+=local.length;
            }
            const normals=primitive.attributes.NORMAL===undefined?null:accessorValues(json,binary,primitive.attributes.NORMAL),indices=primitive.indices===undefined?pool.local.map((_,i)=>i):accessorValues(json,binary,primitive.indices).flat();
            result.triangles+=indices.length/3;
            for(let index=0;index<pool.local.length;index++)if(!normals||Math.abs(Math.hypot(...normals[index])-1)>.02)result.invalidNormals++;
            for(let offset=0;offset<indices.length;offset+=3){
                const ids=indices.slice(offset,offset+3);ids.forEach(index=>pool.used.add(index));
                const crossOf=values=>{const [a,b,c]=ids.map(index=>values[index]),ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);return [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];};
                const cross=crossOf(pool.local),area2=Math.hypot(...cross),worldArea2=Math.hypot(...crossOf(pool.world));
                if(area2<1e-12||worldArea2<1e-12)result.degenerateTriangles++;
                else if(normals&&ids.every(index=>normals[index].reduce((sum,value,k)=>sum+value*cross[k],0)<-area2*.05))result.opposedNormals++;
                triangles.push({ids:ids.map(index=>pool.ids[index]),area:worldArea2*.5,mesh:instance.name,region:instance.region??instance.mesh.extras?.garmentRegion});
            }
        }
        for(const pool of pools.values())result.unusedVertices+=pool.local.length-pool.used.size;
    }
    const connected=unionFind();points.forEach(()=>connected.add());const edges=new Map(),faces=new Set(),used=new Set(),vertexLinks=new Map();
    for(const triangle of triangles){
        triangle.ids=triangle.ids.map(weld.find);triangle.ids.forEach(id=>used.add(id));
        const face=[...triangle.ids].sort((a,b)=>a-b).join(',');if(faces.has(face))result.duplicateTriangles++;faces.add(face);
        for(let k=0;k<3;k++){
            const a=triangle.ids[k],b=triangle.ids[(k+1)%3],edge=a<b?`${a},${b}`:`${b},${a}`;
            edges.set(edge,(edges.get(edge)??0)+1);connected.join(a,b);
        }
        const unique=new Set(triangle.ids);
        for(const id of unique){
            if(!vertexLinks.has(id))vertexLinks.set(id,{edges:new Map(),incidentFaces:0,collapsedFaces:0});
            const link=vertexLinks.get(id);link.incidentFaces++;
            if(unique.size!==3){link.collapsedFaces++;continue;}
            const [a,b]=triangle.ids.filter(other=>other!==id),edge=a<b?`${a},${b}`:`${b},${a}`;
            link.edges.set(edge,(link.edges.get(edge)??0)+1);
        }
    }
    const components=new Map(),componentFor=id=>{
        const root=connected.find(id);if(!components.has(root))components.set(root,{vertices:0,triangles:0,area:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},meshes:new Set(),regions:new Set(),boundaryEdges:0,nonManifoldEdges:0,nonManifoldVertices:0});return components.get(root);
    };
    for(const id of used){const component=componentFor(id);component.vertices++;points[id].forEach((value,k)=>{component.bounds.min[k]=Math.min(component.bounds.min[k],value);component.bounds.max[k]=Math.max(component.bounds.max[k],value);});}
    for(const triangle of triangles){const component=componentFor(triangle.ids[0]);component.triangles++;component.area+=triangle.area;component.meshes.add(triangle.mesh);if(triangle.region)component.regions.add(triangle.region);}
    for(const [edge,count] of edges){const component=componentFor(Number(edge.split(',')[0]));if(count===1){result.boundaryEdges++;component.boundaryEdges++;}if(count>2){result.nonManifoldEdges++;component.nonManifoldEdges++;}}
    for(const [id,link] of vertexLinks){
        const adjacency=new Map(),degrees=new Map();let repeatedLinkEdges=0;
        for(const [edge,count] of link.edges){
            const [a,b]=edge.split(',').map(Number);if(count>1)repeatedLinkEdges++;
            for(const [start,end] of [[a,b],[b,a]]){if(!adjacency.has(start))adjacency.set(start,new Set());adjacency.get(start).add(end);degrees.set(start,(degrees.get(start)??0)+count);}
        }
        const remaining=new Set(adjacency.keys()),linkComponents=[];
        while(remaining.size){
            const first=remaining.values().next().value,pending=[first],members=[];remaining.delete(first);
            while(pending.length){const current=pending.pop();members.push(current);for(const next of adjacency.get(current))if(remaining.delete(next))pending.push(next);}
            const degreeHistogram={};for(const current of members){const degree=degrees.get(current);degreeHistogram[degree]=(degreeHistogram[degree]??0)+1;}
            linkComponents.push({vertices:members.length,edges:members.reduce((n,current)=>n+degrees.get(current),0)/2,degreeHistogram});
        }
        let boundaryEdges=0,incidentNonManifoldEdges=0;
        for(const other of adjacency.keys()){const edge=id<other?`${id},${other}`:`${other},${id}`,count=edges.get(edge);if(count===1)boundaryEdges++;if(count>2)incidentNonManifoldEdges++;}
        const degreeValues=[...degrees.values()],singleFan=linkComponents.length===1,closed=boundaryEdges===0&&degreeValues.length>=3&&degreeValues.every(degree=>degree===2),open=boundaryEdges===2&&degreeValues.filter(degree=>degree===1).length===2&&degreeValues.every(degree=>degree===1||degree===2);
        if(singleFan&&(closed||open)&&!incidentNonManifoldEdges&&!repeatedLinkEdges&&!link.collapsedFaces)continue;
        result.nonManifoldVertices++;componentFor(id).nonManifoldVertices++;
        const reasons=[];if(!singleFan)reasons.push('disconnected vertex fans');if(!closed&&!open)reasons.push('link is neither one closed cycle nor one open boundary path');if(incidentNonManifoldEdges)reasons.push('incident non-manifold edge');if(repeatedLinkEdges)reasons.push('repeated opposite edge in vertex link');if(link.collapsedFaces)reasons.push('incident face collapsed by positional weld');
        result.vertexLinkDetails.push({vertex:id,position:[...points[id]],incidentFaces:link.incidentFaces,collapsedFaces:link.collapsedFaces,boundaryEdges,incidentNonManifoldEdges,repeatedLinkEdges,linkComponentCount:linkComponents.length,linkComponents,reasons});
    }
    result.components=components.size;result.componentDetails=[...components.values()].map(component=>({...component,meshes:[...component.meshes].sort(),regions:[...component.regions].sort()})).sort((a,b)=>b.area-a.area||b.triangles-a.triangles||a.bounds.min[0]-b.bounds.min[0]);
    return result;
}
