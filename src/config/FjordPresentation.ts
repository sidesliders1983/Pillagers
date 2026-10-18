/** Presentation-only treatment for the canonical Fjord. Other worlds retain their lighting. */
export const fjordPresentation = {
    // Owner approval of daylight and snowy comparisons is required before enabling Nordic fog.
    fogProfile: 'current',
    lighting: {
        // Northern sun study: a small fill lift keeps shade and water readable.
        ambientScale: .78 * .56,
        directScale: 1.12 * 1.35,
        skyFill: { color: 0xbfd4ee, mix: .4 },
        groundFill: { color: 0x817970, mix: .35 },
        sunTint: { color: 0xffecd6, mix: .2 },
        // 25° elevation, 135° azimuth (atan2(x,z)); independent of the player camera.
        sunDirection: [.6408563820557885, .42261826174069944, -.6408563820557884],
        shadows: { radius: 1.5, bias: -.00005, normalBias: .02,
            padding: 4, minimumSpan: 64, spanStep: 8 },
    },
} as const;
