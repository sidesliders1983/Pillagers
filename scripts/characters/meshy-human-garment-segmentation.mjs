// Source-pose garment segmentation. Adjacent faces are separated along the
// model's raised collar, armhole and leg-opening creases, not by triangle-centre bins.
export function garmentFaces(primitive,joints){
 const pos=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray();
 const count=indices.length/3,faces=[],points=new Map(),vertexIds=[];
 for(let i=0;i<pos.length;i+=3){const key=[pos[i],pos[i+1],pos[i+2]].map(v=>Math.round(v*1e5)).join(',');if(!points.has(key))points.set(key,points.size);vertexIds.push(points.get(key));}
 const edgeMap=new Map();
 for(let i=0;i<count;i++){
  const ids=Array.from(indices.slice(i*3,i*3+3)),centre=[0,0,0];let limb=0;
  for(const v of ids){
   for(let k=0;k<3;k++)centre[k]+=pos[v*3+k]/3;
   for(const set of [0,1]){
    const j=primitive.getAttribute('JOINTS_'+set)?.getArray(),w=primitive.getAttribute('WEIGHTS_'+set)?.getArray();if(!j||!w)continue;
    for(let k=0;k<4;k++)if(/Arm|Hand|ForeArm/.test(joints[j[v*4+k]]?.getName()??''))limb+=w[v*4+k]/3;
   }
  }
  const a=ids.map(v=>Array.from(pos.slice(v*3,v*3+3))),u=a[1].map((v,k)=>v-a[0][k]),v=a[2].map((v,k)=>v-a[0][k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n),normal=n.map(v=>v/(length||1));
  const [x,y,z]=centre,ax=Math.abs(x);
  // Guides are traced from the authored front/back/side clothing contours.
  // They supply the inside/outside seeds; the mesh crease cost selects the edge.
  const neckline=(z>=0?1.335+.09*(ax/.13)**2:1.375+.035*(ax/.13)**2);
  const armhole=.18+.35*Math.max(0,1.285-y);
  const legOpening=.797+.35*ax;
  const distance=Math.min(y-legOpening,neckline-y,1.445-y,armhole-ax,(.58-limb)*.12);
  faces.push({distance,area:length/2,normal});
  for(let k=0;k<3;k++){
   const va=ids[k],vb=ids[(k+1)%3],ia=vertexIds[va],ib=vertexIds[vb],key=Math.min(ia,ib)+':'+Math.max(ia,ib);
   const edgeLength=Math.hypot(...a[k].map((value,axis)=>value-a[(k+1)%3][axis]));
   if(!edgeMap.has(key))edgeMap.set(key,[]);edgeMap.get(key).push({face:i,length:edgeLength});
  }
 }
 const source=count,sink=count+1,graph=Array.from({length:count+2},()=>[]);
 function edge(a,b,capacity){const f={to:b,capacity,reverse:graph[b].length},r={to:a,capacity:0,reverse:graph[a].length};graph[a].push(f);graph[b].push(r);}
 for(let i=0;i<count;i++){
  const face=faces[i],strength=Math.min(10,Math.abs(face.distance)*face.area*2200*(face.distance<0?3:1));
  // Source-side = white. Strong, distant seeds cannot be swallowed by smoothing.
  edge(source,i,face.distance>=0?strength:0);edge(i,sink,face.distance<0?strength:0);
 }
 for(const adjacent of edgeMap.values())if(adjacent.length===2){
  const [a,b]=adjacent,dot=Math.max(0,faces[a.face].normal.reduce((sum,value,k)=>sum+value*faces[b.face].normal[k],0));
  const cost=a.length*(.025+dot**24)*.45;
  edge(a.face,b.face,cost);edge(b.face,a.face,cost);
 }
 const level=new Int32Array(count+2),cursor=new Int32Array(count+2);
 function bfs(){level.fill(-1);level[source]=0;const queue=[source];for(let q=0;q<queue.length;q++)for(const e of graph[queue[q]])if(e.capacity>1e-10&&level[e.to]<0){level[e.to]=level[queue[q]]+1;queue.push(e.to);}return level[sink]>=0;}
 function send(node,flow){if(node===sink)return flow;for(;cursor[node]<graph[node].length;cursor[node]++){const e=graph[node][cursor[node]];if(e.capacity>1e-10&&level[e.to]===level[node]+1){const pushed=send(e.to,Math.min(flow,e.capacity));if(pushed>1e-10){e.capacity-=pushed;graph[e.to][e.reverse].capacity+=pushed;return pushed;}}}return 0;}
 while(bfs()){cursor.fill(0);while(send(source,Infinity)>1e-10){}}
 const reachable=new Uint8Array(count+2),queue=[source];reachable[source]=1;
 for(let q=0;q<queue.length;q++)for(const e of graph[queue[q]])if(e.capacity>1e-10&&!reachable[e.to]){reachable[e.to]=1;queue.push(e.to);}
 return reachable.slice(0,count);
}



