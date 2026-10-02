import { Vector3 } from 'three';
import { referenceHeadFrames } from './ReferenceHeadFrames';

/** Undo the old common bust frame, then align this source's head to the skull. */
export function referenceHeadMapper(kind:'hair'|'beard',style:string,size:Vector3){
    const key=`${kind}/${style}` as keyof typeof referenceHeadFrames;
    const frame=referenceHeadFrames[key];
    if(!frame)throw new Error(`Missing measured reference head: ${key}`);
    const centre=new Vector3(...frame.centre),up=new Vector3(...frame.up).normalize();
    const front=new Vector3(...frame.front);front.addScaledVector(up,-front.dot(up)).normalize();
    const right=new Vector3().crossVectors(front,up).normalize();
    return (point:Vector3)=>{
        const raw=new Vector3(-point.x/.52,point.z/.52,point.y/.52+.075).sub(centre);
        return point.set(-raw.dot(right)*size.x/(2*frame.radius),raw.dot(up)*size.y/(2*frame.radius),raw.dot(front)*size.z/(2*frame.radius));
    };
}
