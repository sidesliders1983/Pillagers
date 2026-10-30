precision highp float;
varying vec2 v_top;
uniform sampler2D u_photo;
uniform sampler2D u_land;
uniform vec2 u_view;
uniform vec2 u_photoSize;
uniform float u_time;
uniform float u_variant;

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
    return noise(p) * .57 + noise(p * 2.03) * .28 + noise(p * 4.11) * .15;
}
float opening(vec2 p) { return smoothstep(.05, .95, 1. - texture2D(u_land, p).r); }
vec2 safeSample(vec2 original, vec2 shifted) {
    return mix(original, shifted, smoothstep(.05, .7, opening(shifted)));
}
vec3 curtain(vec2 p, float t) {
    float arc = .27 + sin(p.x * 8. - t * .035) * .055 + sin(p.x * 17. + t * .02) * .022;
    float d = p.y - arc;
    float envelope = exp(min(d, 0.) * 7.) * exp(-max(d, 0.) * 46.);
    envelope *= smoothstep(.27, .46, p.x) * (1. - smoothstep(.93, 1., p.x));
    float strands = .45 + .55 * noise(vec2(p.x * 125. + sin(p.y * 6. + t * .04), t * .025));
    float density = clouds(vec2(p.x * 6. - t * .012, p.y * 1.5 + t * .008));
    vec3 green = vec3(.08, .8, .5), cyan = vec3(.09, .5, .8), violet = vec3(.7, .18, .78);
    vec3 colour = mix(green, cyan, smoothstep(.46, .69, p.x));
    colour = mix(colour, violet, smoothstep(.66, .85, p.x) * (.65 + .2 * sin(t * .06)));
    return colour * envelope * strands * smoothstep(.22, .79, density);
}
void main() {
    vec2 cover = u_photoSize * max(u_view.x / u_photoSize.x, u_view.y / u_photoSize.y);
    vec2 p = (v_top * u_view + (cover - u_view) * .5) / cover;
    vec3 regions = texture2D(u_land, p).rgb;
    float sky = regions.g;
    float water = regions.b;
    float alpha = max(sky, water);
    if (alpha < .001) { gl_FragColor = vec4(0.); return; }
    float t = u_time;
    vec3 skyColour = vec3(0.);
    if (sky > .001) {
        float altitude = 1. - smoothstep(.34, .62, p.y);
        vec2 air = vec2(sin(p.y * 11. + t * .055) * .004 + sin(t * .035) * .002,
            sin(p.x * 12. + t * .07) * .002) * altitude;
        vec2 skyUV = safeSample(p, p + air);
        skyColour = texture2D(u_photo, skyUV).rgb;
        if (u_variant > .5) {
            float cloud = clouds(vec2(p.x * 4. + t * .007, p.y * 3. - t * .003));
            skyColour *= .95 + .075 * cloud;
            float originalGreen = smoothstep(.12, .3, skyColour.g - skyColour.r * .7)
                * smoothstep(.27, .57, skyColour.g) * altitude;
            skyColour *= 1. - originalGreen * .23;
            skyColour += curtain(p, t) * .33;
        } else {
            float light = sin(p.x * 15. + p.y * 6. - t * .09) * .025;
            skyColour *= 1. + light * altitude;
        }
    }
    vec3 waterColour = vec3(0.);
    if (water > .001) {
        float depth = max(0., (p.y - .635) / .365);
        float ripple = sin(p.y * 340. - t * 1.15 + noise(vec2(p.x * 19., p.y * 8.)) * 6.);
        vec2 waterUV = p + vec2(ripple * (.0004 + depth * .0022),
            sin(p.x * 49. + p.y * 120. + t * .7) * .00045 * depth);
        waterUV = safeSample(p, waterUV);
        waterColour = texture2D(u_photo, waterUV).rgb;
        waterColour *= 1. + ripple * .024 * depth;
        if (u_variant > .5) {
            vec2 reflection = vec2(p.x + ripple * .004 * depth, .635 - (p.y - .635) * .88);
            waterColour += curtain(reflection, t) * (.035 + .055 * depth) * (.55 + .45 * ripple);
        }
    }
    vec3 colour = (skyColour * sky + waterColour * water) / max(.0001, sky + water);
    // Match the existing entry scrim only inside the animated openings. Opaque scenery stays the original CSS image.
    float scrim = .65 * clamp(1. - v_top.x / .72, 0., 1.);
    colour = mix(colour, vec3(3., 15., 23.) / 255., scrim);
    gl_FragColor = vec4(colour, alpha);
}
