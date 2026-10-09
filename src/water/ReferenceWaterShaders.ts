import { WATER_WAVES, WATER_WAVE_GRAVITY, WATER_WAVE_TAU } from './ReferenceWaterWaves';

const waveCalls = WATER_WAVES.map(wave =>
    `        addWave(worldPosition.xz, vec2(${wave.x}, ${wave.z}), ${wave.wavelength}, ${wave.weight}, height, slope);`
).join('\n');

export const REFERENCE_WATER_VERTEX = /* glsl */ `
    uniform float uTime;
    uniform float uWaveAmplitude;
    uniform float uGridSpacing;
    attribute float waveFade;
    uniform float uWaveSpeed;
    varying vec3 vWorldPosition;
    varying vec2 vWaveSlope;

    void addWave(
        vec2 point, vec2 direction, float wavelength, float weight,
        inout float height, inout vec2 slope
    ) {
        float frequency = ${WATER_WAVE_TAU} / wavelength;
        float phase = dot(point, direction) * frequency
            - uTime * uWaveSpeed * sqrt(${WATER_WAVE_GRAVITY} * frequency);
        // Mesh LOD drops wavelengths the current grid cannot resolve.
        float resolved = smoothstep(uGridSpacing * 2.0, uGridSpacing * 4.0, wavelength);
        float amplitude = uWaveAmplitude * weight * resolved;
        height += sin(phase) * amplitude;
        slope += direction * (cos(phase) * amplitude * frequency);
    }

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        float height = 0.0;
        vec2 slope = vec2(0.0);
${waveCalls}
        worldPosition.y += height * waveFade;
        vWaveSlope = slope * waveFade;
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

export const REFERENCE_WATER_FRAGMENT = /* glsl */ `
    uniform sampler2D uSurfaceTexture;
    uniform float uTime;
    uniform float uWaveSpeed;
    uniform float uDetailStrength;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uSkyColor;
    uniform vec3 uSunColor;
    uniform vec3 uSunDirection;
    uniform float uLightIntensity;
    uniform float uOrthographic;
    uniform vec3 uViewDirection;
    varying vec3 vWorldPosition;
    varying vec2 vWaveSlope;

    void main() {
        vec2 point = vWorldPosition.xz;
        float time = uTime * uWaveSpeed;
        mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
        vec3 first = texture2D(uSurfaceTexture, point * 0.075 + time * vec2(0.007, 0.003)).rgb;
        vec3 second = texture2D(uSurfaceTexture,
            rotation * point * 0.16 + time * vec2(-0.004, 0.009)).rgb;
        vec2 detailSlope = (first.rg * 2.0 - 1.0) * 0.72;
        detailSlope += mat2(0.8, -0.6, 0.6, 0.8) * (second.rg * 2.0 - 1.0) * 0.36;

        // Fade unresolved detail before it becomes sparkling subpixel noise.
        float footprint = max(length(dFdx(point)), length(dFdy(point)));
        float fineVisibility = 1.0 - smoothstep(0.04, 0.32, footprint);
        #if WATER_DETAIL_LAYERS == 3
            vec2 fine = texture2D(uSurfaceTexture,
                point * 0.32 + time * vec2(0.012, -0.008)).rg * 2.0 - 1.0;
            detailSlope += fine * 0.16 * fineVisibility;
        #endif

        float distanceToCamera = length(cameraPosition - vWorldPosition);
        float distanceVisibility = mix(
            1.0 - smoothstep(35.0, 180.0, distanceToCamera), 1.0, uOrthographic);
        float detailVisibility = mix(0.18, 1.0, fineVisibility * distanceVisibility);
        vec2 slope = vWaveSlope + detailSlope * uDetailStrength * detailVisibility;
        vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 viewDirection = normalize(mix(
            cameraPosition - vWorldPosition, -uViewDirection, uOrthographic));
        float facing = max(dot(normal, viewDirection), 0.0);

        // An opaque absorption tint approximates clear water without a sea-floor pass.
        float transmission = exp(-0.56 / max(facing, 0.08));
        float bodyVariation = 0.80 + first.b * 0.24 + second.b * 0.12;
        vec3 body = mix(uDeepColor, uShallowColor, transmission) * bodyVariation;
        float diffuse = max(dot(normal, uSunDirection), 0.0);
        body *= 0.72 + diffuse * 0.28;

        vec3 reflected = reflect(-viewDirection, normal);
        float horizon = pow(1.0 - clamp(reflected.y, 0.0, 1.0), 3.0);
        vec3 sky = uSkyColor * mix(0.70, 1.22, horizon);
        float cloudBand = smoothstep(0.42, 0.72, first.b + second.b * 0.14);
        sky = mix(sky, uSkyColor * 1.32, cloudBand * 0.22);
        float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
        float reflection = fresnel;
        vec3 color = mix(body, sky, reflection);

        vec3 halfVector = viewDirection + uSunDirection;
        vec3 halfway = halfVector / max(length(halfVector), 0.0001);
        float sunAlignment = max(dot(normal, halfway), 0.0);
        float broadHighlight = pow(sunAlignment, 64.0) * 0.025;
        float crispHighlight = pow(sunAlignment, mix(110.0, 420.0, fineVisibility)) * 1.2;
        color += uSunColor * (broadHighlight + crispHighlight) * diffuse;
        color *= uLightIntensity;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;
