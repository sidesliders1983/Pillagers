import {Bone, Vector3} from 'three';
import type {MeshyHuman} from '../characters/MeshyHuman';
import type {UniversalHuman, HumanAnimation} from './UniversalHuman';

/** Estimate an in-place gait's pace from backward travel of its low stance feet. */
export function humanPreviewGroundSpeed(model: MeshyHuman | UniversalHuman, animation: string) {
    if (!['Walk', 'Run', 'InjuredWalk', 'Walking', 'Running', 'Unsteady_Walk'].includes(animation)) {
        return 0;
    }
    const aliases: Record<string, string> = {
        Walk: 'Walking', Run: 'Running', InjuredWalk: 'Unsteady_Walk',
    };
    const clip = model.clips.find(clip => clip.name === animation)
        ?? model.clips.find(clip => clip.name === aliases[animation]);
    if (!clip) return 0;
    const feet: Bone[] = [];
    model.root.traverse(node => {
        if ((node as Bone).isBone && /(?:Foot$|^Foot_[LR]$)/.test(node.name)) feet.push(node as Bone);
    });
    if (feet.length !== 2) return 0;

    const savedTime = model.animationState.time;
    const steps = 60;
    const step = clip.duration / steps;
    const samples: Vector3[][] = feet.map(() => []);
    try {
        for (let index = 0; index <= steps; index++) {
            model.sampleAnimation(clip.name as HumanAnimation, index * step);
            for (const [foot, bone] of feet.entries()) {
                samples[foot].push(bone.getWorldPosition(new Vector3()));
            }
        }
    } finally {
        model.sampleAnimation(clip.name as HumanAnimation, savedTime);
    }
    const velocities: number[] = [];
    for (const points of samples) {
        const low = Math.min(...points.map(point => point.y));
        const high = Math.max(...points.map(point => point.y));
        const stanceHeight = low + (high - low) * .2;
        for (let index = 1; index < points.length; index++) {
            const previous = points[index - 1], current = points[index];
            const speed = (previous.z - current.z) / step;
            if (previous.y <= stanceHeight && current.y <= stanceHeight && speed > .01) {
                velocities.push(speed);
            }
        }
    }
    if (!velocities.length) return 0;
    velocities.sort((a, b) => a - b);
    return velocities[Math.floor(velocities.length / 2)];
}
