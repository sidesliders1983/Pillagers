import { WIND_LATTICE_GLSL } from './windNoise.glsl';

/**
 * Grass blade vertex shader.
 *
 * Per-instance attributes:
 *   instanceMatrix    — transform of one tuft
 *   instanceColor     — base blade color
 *   birthTime         — time the tuft was spawned (for grow-in animation)
 *
 * Uniforms (see {@link GRASS_UNIFORM_KEYS}):
 *   time, windSpeed, windStrength, gustStrength, bendStrength,
 *   growthDuration, pushCenter/Radius/Strength/Enabled,
 *   uTerrainHeightmap, uTerrainParams (worldSize, 1/resolution).
 */
export const GRASS_VERTEX = /* glsl */ `
  precision highp float;
  precision highp int;

  #include <common>
  #include <shadowmap_pars_vertex>

  ${WIND_LATTICE_GLSL}

  uniform float time;
  uniform float windSpeed;
  uniform float windStrength;
  uniform float gustStrength;
  uniform float bendStrength;
  uniform float growthDuration;
  uniform vec2  pushCenter;
  uniform float pushRadius;
  uniform float pushStrength;
  uniform float pushEnabled;

  uniform sampler2D uTerrainHeightmap;
  // x = worldSize, y = 1.0 / resolution (texel size for finite-difference slope)
  uniform vec2 uTerrainParams;

  in float birthTime;

  out vec3  vWorldNormal;
  out vec3  vBladeColor;
  out float vGradient;
  out vec3  vWorldPos;

  void main() {
    vec3 transformed   = position;
    vec3 objectNormal  = vec3(normal);
    float gradient     = uv.y;
    float tipWeight    = gradient * gradient;
    vec3 instanceOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

    float viewDist        = length(cameraPosition - instanceOrigin);
    float distWidthBoost  = 1.0 + smoothstep(8.0, 24.0, viewDist) * 1.5;
    float windDamping     = 1.0 - smoothstep(12.0, 24.0, viewDist) * 0.55;

    // Sample terrain height at blade root (UV = (xz / worldSize) + 0.5)
    vec2 terrainUV = instanceOrigin.xz / uTerrainParams.x + 0.5;
    float terrainH = texture(uTerrainHeightmap, terrainUV).r;

    // Slope from 2 forward-neighbour samples (cheap finite difference)
    float ts        = uTerrainParams.y;
    float worldStep = uTerrainParams.x * ts;
    float hR        = texture(uTerrainHeightmap, terrainUV + vec2(ts,  0.0)).r;
    float hU        = texture(uTerrainHeightmap, terrainUV + vec2(0.0, ts )).r;
    float slopeMag  = length(vec2(hR - terrainH, hU - terrainH)) / max(worldStep, 1e-5);

    // Cull blades on rocky slopes — no grass on cliffs.
    if (slopeMag > 0.65) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Stochastic thinning across the slope shoulder for a soft transition.
    float slopeSuppress = smoothstep(0.28, 0.65, slopeMag);
    float bladeHash     = fract(sin(dot(instanceOrigin.xz, vec2(127.1, 311.7))) * 43758.545);
    if (bladeHash < slopeSuppress) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Grow-in animation (smoothstep over growthDuration seconds since birthTime)
    float growth = clamp((time - birthTime) / max(growthDuration, 1e-4), 0.0, 1.0);
    growth       = growth * growth * (3.0 - 2.0 * growth);

    // Two-octave wind sway (one slow, one gust) plus a bend term that arcs the blade.
    float windA = sin(windNoise(instanceOrigin.xz, time * windSpeed) * 3.14159 - 1.5708 + 0.3)
                * 0.0735 * windStrength;
    float windB = sin(windNoise(instanceOrigin.xz + vec2(13.7, -9.1), time * (windSpeed * 0.73 + 0.21)) * 3.14159 - 1.5708 + 0.3)
                * 0.0735 * gustStrength;
    float sway  = (windA + windB) * windDamping;
    float bend  = bendStrength
                * (0.65 + windNoise(instanceOrigin.xz + vec2(-4.3, 7.1), time * (windSpeed * 0.41 + 0.13)) * 0.7)
                * windDamping;

    // Push field — used for footsteps / animals brushing through grass.
    vec2  pushOffset  = vec2(0.0);
    float pushFlatten = 0.0;
    if (pushEnabled > 0.5 && pushRadius > 1e-4) {
      vec2 away = instanceOrigin.xz - pushCenter;
      float distSq = dot(away, away);
      float radiusSq = pushRadius * pushRadius;
      if (distSq < radiusSq) {
        float dist = sqrt(max(distSq, 1e-8));
        vec2  pushDir = dist > 1e-4 ? away / dist : vec2(0.0, 1.0);
        float field   = 1.0 - smoothstep(0.0, pushRadius, dist);
        field        *= field;
        pushOffset    = pushDir * (pushStrength * field * tipWeight);
        pushFlatten   = field * tipWeight;
      }
    }

    float widthGrowth = mix(0.24, 1.0, growth);
    transformed.x *= mix(1.0, 0.42, gradient * 0.88);
    transformed.x *= widthGrowth * distWidthBoost;
    transformed.y *= growth * (1.0 - pushFlatten * 0.22);
    transformed.z *= growth;
    transformed.x += sway * tipWeight + pushOffset.x;
    transformed.z += (bend + sway * 0.9) * tipWeight + pushOffset.y;

    vec3 transformedNormal = objectNormal;
    mat3 im = mat3(instanceMatrix);
    transformedNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    transformedNormal  = normalize(normalMatrix * (im * transformedNormal));

    vWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
    vBladeColor  = instanceColor;
    vGradient    = gradient;
    vec3 bladeWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    vWorldPos    = bladeWorldPos + vec3(0.0, terrainH, 0.0);

    #include <project_vertex>

    // Lift the projected position by terrain height in view space.
    vec4 terrainLift = projectionMatrix * (viewMatrix * vec4(0.0, terrainH, 0.0, 0.0));
    gl_Position += terrainLift;

    #include <worldpos_vertex>
    #include <shadowmap_vertex>
  }
`;

/**
 * Grass fragment shader. Sun + ambient + fill three-light setup with a tip
 * brightening and an optional shadow map factor.
 */
export const GRASS_FRAGMENT = /* glsl */ `
  precision highp float;

  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  uniform float tipLift;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uAmbientColor;
  uniform vec3  uFillDir;
  uniform vec3  uFillColor;

  in vec3  vWorldNormal;
  in vec3  vBladeColor;
  in float vGradient;
  in vec3  vWorldPos;
  out vec4 fragColor;

  void main() {
    float normalLen = length(vWorldNormal);
    if (normalLen <= 1e-6) discard;

    vec3 normal  = vWorldNormal / normalLen;
    vec3 sunDir  = normalize(uSunDir);
    vec3 fillDir = normalize(uFillDir);

    float sun  = max(0.0, dot(normal, sunDir));
    float hemi = 0.5 + 0.5 * normal.y;
    float fill = max(0.0, dot(normal, fillDir));

    float tip      = smoothstep(0.0, 1.0, vGradient);
    vec3 tipColor  = min(vec3(1.0), vBladeColor + vec3(tipLift, tipLift * 0.9, tipLift * 0.28));
    vec3 color     = mix(vBladeColor * 0.78, tipColor, tip);

    vec3 lighting = uAmbientColor * mix(0.82, 1.18, hemi)
                  + uSunColor * sun
                  + uFillColor * fill;
    color *= lighting;

    #if NUM_DIR_LIGHT_SHADOWS > 0
      DirectionalLightShadow dls = directionalLightShadows[0];
      float grassShadow = getShadow(directionalShadowMap[0], dls.shadowMapSize, dls.shadowIntensity,
                                    dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[0]);
      color *= mix(0.5, 1.0, grassShadow);
    #endif

    color = pow(max(color, vec3(0.0)), vec3(0.92));
    fragColor = vec4(color, 1.0);
  }
`;
