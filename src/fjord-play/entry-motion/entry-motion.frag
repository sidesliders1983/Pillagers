precision highp float;
varying vec2 v_top;
uniform sampler2D u_photo;
uniform sampler2D u_land;
uniform vec2 u_view;
uniform vec2 u_photoSize;
uniform float u_time;
uniform float u_variant;
uniform float u_auroraBrightness;
uniform float u_auroraSpeed;
uniform float u_auroraSway;
uniform float u_cloudDrift;
uniform float u_cloudCoverage;
uniform float u_waveStrength;
uniform float u_waveSpeed;
uniform float u_reflectionStrength;

float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
        mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y);
}
float clouds(vec2 p) {
    return noise(p) * .55 + noise(p * 2.03) * .3 + noise(p * 4.11) * .15;
}
vec2 safeSample(vec2 original, vec2 shifted) {
    vec3 regions = texture2D(u_land, shifted).rgb;
    return mix(original, shifted, smoothstep(.05, .85, max(regions.g, regions.b)));
}
vec3 curtain(vec2 p, float t) {
    // A changing lower edge and independently shearing strands, not a global tint pulse.
    float sway = u_auroraSway;
    float arc = .25 + sin(p.x * 8. - t * .24) * .06 * sway
        + sin(p.x * 19. + t * .32) * .022 * sway;
    float d = p.y - arc;
    float envelope = exp(min(d, 0.) * 8.) * exp(-max(d, 0.) * 50.);
    envelope *= smoothstep(.20, .40, p.x) * (1. - smoothstep(.97, 1., p.x));
    float strandX = p.x * 150. + sin(p.y * 13. + t * .27) * 3. * sway - t * .7;
    float strands = .18 + .82 * noise(vec2(strandX, t * .12));
    float density = .35 + .65 * clouds(vec2(p.x * 7. - t * .035, p.y * 1.5));
    vec3 green = vec3(.07, .9, .5), cyan = vec3(.07, .55, .85), violet = vec3(.8, .17, .9);
    vec3 colour = mix(green, cyan, smoothstep(.43, .66, p.x));
    colour = mix(colour, violet, smoothstep(.63, .77, p.x) * (1. - smoothstep(.83, .98, p.x)));
    return colour * envelope * strands * density * u_auroraBrightness;
}
void main() {
    vec2 cover = u_photoSize * max(u_view.x / u_photoSize.x, u_view.y / u_photoSize.y);
    vec2 p = (v_top * u_view + (cover - u_view) * .5) / cover;
    vec3 regions = texture2D(u_land, p).rgb;
    float sky = regions.g, water = regions.b;
    float alpha = max(sky, water);
    if (alpha < .001) { gl_FragColor = vec4(0.); return; }
    float t = u_time;
    vec3 skyColour = vec3(0.);
    if (sky > .001) {
        float altitude = 1. - smoothstep(.34, .62, p.y);
        float auroraTime = t * u_auroraSpeed;
        float cloudTime = t * u_cloudDrift;
        vec3 source = texture2D(u_photo, p).rgb;
        float green = smoothstep(.015, .12, source.g - source.r * .8);
        vec2 auroraShift = vec2(sin(p.y * 11. + auroraTime * .24) * .023,
            sin(p.x * 12. + auroraTime * .29) * .012) * u_auroraSway;
        vec2 cloudShift = vec2(sin(cloudTime * .12) * .025, sin(cloudTime * .08) * .004);
        vec2 skyUV = safeSample(p, p + mix(cloudShift, auroraShift, green) * altitude);
        skyColour = texture2D(u_photo, skyUV).rgb;
        skyColour *= 1. + (u_auroraBrightness - 1.) * green * altitude;
        if (u_variant > .5) {
            // Keep the photographic sky; independently moving curtains remain an additive layer.
            float density = clouds(p * vec2(5., 8.) + vec2(-cloudTime * .014, cloudTime * .0015));
            float threshold = mix(.83, .32, u_cloudCoverage);
            float cloudCover = smoothstep(threshold, threshold + .18, density);
            cloudCover *= smoothstep(0., .1, u_cloudCoverage) * smoothstep(.04, .16, p.y);
            skyColour *= 1. - cloudCover * .16;
            skyColour += curtain(p, auroraTime) * .7 * (1. - cloudCover * .7);
        }
    }
    vec3 waterColour = vec3(0.);
    if (water > .001) {
        float depth = max(0., (p.y - .635) / .365);
        float edge = smoothstep(0., 1., water);
        float waveTime = t * u_waveSpeed;
        float ripple = sin(p.y * 230. - waveTime * 2.2 + sin(p.x * 17. + waveTime * .3) * 1.7)
            + .35 * sin(p.y * 510. + p.x * 11. - waveTime * 3.1);
        vec2 displacement = vec2(ripple * (.0007 + depth * .0045),
            sin(p.x * 49. + p.y * 120. - waveTime * 1.5) * .0012 * depth) * u_waveStrength * edge;
        waterColour = texture2D(u_photo, safeSample(p, p + displacement)).rgb;
        waterColour *= 1. + ripple * .08 * depth * min(u_waveStrength, 2.) * edge;
        if (u_variant > .5) {
            vec2 reflection = vec2(p.x + ripple * .009 * depth * u_waveStrength,
                .635 - (p.y - .635) * 1.7);
            waterColour += curtain(reflection, t * u_auroraSpeed)
                * .42 * u_reflectionStrength * edge * max(0., .55 + .45 * ripple * min(u_waveStrength, 1.));
        }
    }
    vec3 colour = (skyColour * sky + waterColour * water) / max(.0001, sky + water);
    float scrim = .65 * clamp(1. - v_top.x / .72, 0., 1.);
    colour = mix(colour, vec3(3., 15., 23.) / 255., scrim);
    gl_FragColor = vec4(colour, alpha);
}
