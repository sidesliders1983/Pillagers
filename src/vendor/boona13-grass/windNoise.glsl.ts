/**
 * Wind lattice noise — bilinear hash field driven by uTime.
 *
 * A Wang-hash style integer hash with a final avalanche step, sampled at the
 * four lattice corners around `worldXZ * 0.1 + (uTime * 1.2, 0)` and
 * bilinearly interpolated with a smoothstep (cubic Hermite) easing.
 *
 * Drives the per-blade sway in the grass shader and is reusable for any
 * other instanced foliage that needs coherent wind motion.
 *
 * Requires GLSL 3.00 ES (Three.js `THREE.GLSL3`) for `uintBitsToFloat`.
 */
export const WIND_LATTICE_GLSL = /* glsl */ `
float windHash(uvec2 p) {
  uint y = p.y;
  uint h = y + (y << 10u);
  h ^= h >> 6u;
  h += h << 3u;
  h ^= h >> 11u;
  uint x = p.x;
  h = ((x * 1664525u) + (h + (h << 15u)) + 1013904223u) * 1664525u;
  h ^= h >> 11u;
  h ^= (h << 7u) & 2636928640u;
  h ^= (h << 15u) & 4022730752u;
  h ^= h >> 18u;
  return uintBitsToFloat((h & 8388607u) | 1065353216u) - 1.0;
}

float windNoise(vec2 worldXZ, float uTime) {
  vec2 uv = worldXZ * 0.1 + vec2(uTime * 1.2, 0.0);
  ivec2 i = ivec2(floor(uv));
  vec2 f = fract(uv);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float n00 = windHash(uvec2(i));
  float n10 = windHash(uvec2(i + ivec2(1, 0)));
  float n01 = windHash(uvec2(i + ivec2(0, 1)));
  float n11 = windHash(uvec2(i + ivec2(1)));
  return mix(mix(n00, n10, s.x), mix(n01, n11, s.x), s.y);
}
`;
