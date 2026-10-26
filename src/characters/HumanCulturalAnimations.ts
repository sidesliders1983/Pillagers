/** Offline-qualified native motion bank; no eager source-body extension. */
export const humanCulturalAnimations = {
    path: '/game-assets/human/Human_CulturalAnimations.glb',
    sha256: '8fb9ff11a617d53064515f152cab184de2804a23eece4e5456edf66b92ae143f',
    bytes: 445676,
    maximumTrackBytes: 524288,
    clips: ['Storytelling_Gesture', 'Gathering_Applause'],
    applause: {
        qualification: 'near-contact-only',
        windows: [14 / 30, 22 / 30, 1, 37 / 30],
        automaticContactSound: false,
    },
} as const;
export type CulturalAnimationName = typeof humanCulturalAnimations.clips[number];
