// 96 vec4 wave uniforms + resolution/count fit WebGL 1's 128-vector minimum.
export const WAVE_LIMIT = 48;
export const PROFILE_WIDTH = 2048;
export const PROFILE_HEIGHT = 64;

// RGB24 encodes [-2, 2], comfortably covering the normalized waveform tables.
// Nearest sampling + explicit interpolation reproduces simulation.sample().
export function packProfile(table, pixels) {
  pixels.fill(0);
  for (let i = 0; i < table.length; i++) {
    const value = Math.round((table[i] + 2) * (16777215 / 4));
    pixels[i * 4] = value >>> 16;
    pixels[i * 4 + 1] = (value >>> 8) & 255;
    pixels[i * 4 + 2] = value & 255;
    pixels[i * 4 + 3] = 255;
  }
}

export const waveVertexShader = `
precision highp float;
attribute vec2 p; // normalized u, then 0 for far rail or 1 for wave boundary
uniform vec2 resolution;
uniform int waveCount;
uniform vec4 waveMotion[${WAVE_LIMIT}]; // u, signed amplitude, age, speed
uniform vec4 waveShape[${WAVE_LIMIT}]; // growth, life, profile row, unused
uniform highp sampler2D profiles;

float profileValue(float index, float row) {
  vec3 rgb = texture2D(profiles, vec2((index + 0.5) / ${PROFILE_WIDTH}.0,
                                       (row + 0.5) / ${PROFILE_HEIGHT}.0)).rgb;
  return dot(rgb, vec3(65536.0, 256.0, 1.0)) * (255.0 * 4.0 / 16777215.0) - 2.0;
}
void main() {
  float length = length(resolution);
  vec2 normal = resolution.yx / length;
  float displacement = 0.0;
  // The far rail is static; only boundary vertices evaluate waves.
  if (p.y > 0.5) {
    for (int i = 0; i < ${WAVE_LIMIT}; i++) {
      if (i >= waveCount) break;
      vec4 motion = waveMotion[i];
      vec4 shape = waveShape[i];
      float dx = (p.x - motion.x) * length;
      float distance = sqrt(dx * dx + 44.0 * 44.0) - 44.0;
      float t = motion.z - distance / motion.w;
      if (t <= 0.0 || t >= shape.y || t >= 16.0) continue;
      float maxDistance = max(1.0, (p.x < motion.x ? motion.x : 1.0 - motion.x) * length);
      float r = min(1.0, distance / maxDistance);
      float sampleIndex = t * 100.0;
      float index = floor(sampleIndex);
      float profile = mix(profileValue(index, shape.z), profileValue(index + 1.0, shape.z), fract(sampleIndex));
      displacement += motion.y * (1.0 + shape.x * r * r * (3.0 - 2.0 * r)) * profile;
    }
  }
  // Fill along the diagonal normal, never along screen-space vertical columns.
  // Neighboring strips then occupy distinct tangent intervals even when x folds.
  vec2 base = vec2(p.x * resolution.x, (1.0 - p.x) * resolution.y);
  vec2 v = (base + normal * mix(-length, displacement, p.y)) / resolution;
  gl_Position = vec4(v.x * 2.0 - 1.0, 1.0 - v.y * 2.0, 0.0, 1.0);
}`;
