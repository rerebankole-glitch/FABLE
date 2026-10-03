import * as THREE from 'three';
import { TILE_PX } from '../blocks/Tiles';

/**
 * Chunk shader. The "shader pack" features are compiled in behind #defines so the base path costs
 * nothing when shaders are off; `createChunkMaterial` / `setShaderFeatures` toggle them at runtime.
 *
 *   WAVE     waving leaves / grass / crops (vertex offset driven by aFlags.x)
 *   WATER_FX animated water normal ripples + fresnel + sky-reflection tint
 *   GRADE    filmic colour grading: warmer highlights, cooler shadows, gentle S-curve contrast
 *   SUNLIGHT directional shading: faces towards the sun catch a warm highlight (fake specular sun)
 *   GODRAY   sun disc glow bleeding into the fog near the sun
 */
export const CHUNK_VERT = /* glsl */ `
attribute vec3 aLight;   // sky, block, ao*shade
attribute vec3 aColor;
attribute float aFlags;  // 1 = waving foliage (anchored at the bottom), 2 = waving tall plant (both ends), 0 = static
// Greedy meshing merges N coplanar faces of the same block into one quad whose uv runs 0..N. aTile
// carries that quad's atlas cell (origin.xy, size.zw) so the fragment shader can wrap the repeated
// uv back inside the cell instead of smearing across neighbouring tiles.
attribute vec4 aTile;
varying vec2 vUv;
varying vec4 vTile;
varying vec3 vLight;
varying vec3 vColor;
varying float vFogDepth;
varying vec3 vWorldPos;
varying vec3 vViewDir;
uniform float uTime;
uniform int uWater;
uniform float uWind;
void main() {
  vUv = uv;
  vTile = aTile;
  vLight = aLight;
  vColor = aColor;
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  if (uWater == 1) {
    wp.y += sin(wp.x * 0.9 + uTime * 1.6) * 0.04 + cos(wp.z * 1.1 + uTime * 1.3) * 0.04 - 0.05;
  }
#ifdef WAVE
  if (aFlags > 0.5) {
    // foliage sways with the wind; plants pivot from their base (uv.y == 1 is the bottom of a cross quad)
    float ph = wp.x * 0.7 + wp.z * 0.5 + wp.y * 0.3;
    float w = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.4;
    float amp = (0.035 + uWind * 0.08);
    float anchor = aFlags > 1.5 ? (1.0 - fract(p.y)) : 1.0;
    wp.x += w * amp * anchor;
    wp.z += cos(uTime * 1.3 + ph * 0.8) * amp * 0.6 * anchor;
  }
#endif
  vWorldPos = wp.xyz;
  vViewDir = cameraPosition - wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const CHUNK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSkyTint;
uniform vec3 uSunDir;
uniform float uSunStrength;
uniform float uBrightness; // settings brightness 0..1: lifts the darkest light levels (like a gamma slider)
uniform int uWater;
uniform float uTime;
varying vec2 vUv;
varying vec4 vTile;
uniform vec2 uTexelInset;
varying vec3 vLight;
varying vec3 vColor;
varying float vFogDepth;
varying vec3 vWorldPos;
varying vec3 vViewDir;

vec3 faceNormal() {
  vec3 dx = dFdx(vWorldPos), dz = dFdy(vWorldPos);
  vec3 n = normalize(cross(dx, dz));
  return n;
}

/**
 * Slight per-BLOCK brightness variation, so a large flat surface (a stone cliff, a plank floor) reads
 * as laid blocks instead of one muddy tone. The hash comes from the block's own cell - derived from
 * the face normal and the world position - so it is constant across a face and, crucially, constant
 * across a greedy-merged quad: merging still works and the world costs exactly what it did before.
 * Wrapped to 64 blocks before hashing so float precision stays clean far from the origin.
 */
float blockTone() {
  vec3 n = faceNormal();
  vec3 cell = floor(vWorldPos - n * 0.5);
  vec3 p = fract(mod(cell, 64.0) * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  // Greedy quads carry a uv that runs 0..N across N merged blocks; wrap it back into this quad's
  // atlas cell so the texture repeats per block instead of stretching. The atlas is NearestFilter
  // with no mipmaps, so a plain sample is correct here and needs no derivative extension.
  // Half-texel inset keeps the wrap from bleeding into the neighbouring atlas cell.
  vec2 cell = clamp(fract(vUv), uTexelInset, 1.0 - uTexelInset);
  vec4 tex = texture2D(uAtlas, vTile.xy + cell * vTile.zw);
  if (uWater == 0 && tex.a < 0.5) discard;
  float sky = vLight.x * min(1.0, uDaylight + uBrightness * 0.15);
  float blockL = vLight.y;
  // sky light: near-black in unlit caves, tinted by the time of day (uSkyTint = warm at sunset, cool at night)
  vec3 skyCol = mix(vec3(0.025, 0.03, 0.07), uSkyTint, sky);
  // block light: warm torch colour, slightly whiter when very bright
  vec3 blockCol = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.92, 0.78), blockL * blockL) * blockL;
  vec3 light = max(skyCol, blockCol);
  // deep caves stay dark but never fully black so shapes remain readable
  light = max(light, vec3(0.035, 0.035, 0.045) + uBrightness * 0.09);
  float shade = vLight.z;
#ifdef SUNLIGHT
  {
    // directional sun: sky-lit faces pointing at the sun get a warm lift, faces away get a cool dip.
    vec3 n = faceNormal();
    float nd = dot(n, normalize(uSunDir));
    float lit = vLight.x * uSunStrength;
    shade *= 1.0 + nd * 0.16 * lit;
    light += vec3(0.10, 0.07, 0.03) * max(nd, 0.0) * lit;
  }
#endif
  // Colour pipeline: the atlas is decoded to linear by the GPU and the output is sRGB-encoded below, so the
  // authored pixel-art colours display exactly as painted. Shade / AO / light / biome-tint multipliers were
  // designed as perceptual (display-space) factors, so they are applied with gamma 2.2 to keep that contrast.
  // +/-5% block-to-block brightness, signed around 1 so the average stays exactly as authored
  float tone = 1.0 + (blockTone() - 0.5) * 0.10;
  vec3 col = tex.rgb * pow(max(vColor * light * shade * tone, 0.0), vec3(2.2));
  float alpha = tex.a;
  if (uWater == 1) {
    float fres = 0.55 + 0.35 * sin(vWorldPos.x * 0.5 + vWorldPos.z * 0.35 + uTime * 0.7) * 0.2;
    alpha = 0.62 * fres + 0.2;
#ifdef WATER_FX
    // animated ripple normal + fresnel: looking along the surface reflects the sky, looking down shows the water
    vec3 v = normalize(vViewDir);
    vec2 rp = vWorldPos.xz * 0.9 + uTime * vec2(0.35, 0.22);
    float h1 = sin(rp.x * 2.1 + rp.y * 1.3) + sin(rp.x * 1.1 - rp.y * 2.7 + uTime * 0.8);
    vec3 n = normalize(vec3(h1 * 0.08, 1.0, cos(rp.y * 2.3 + rp.x) * 0.08));
    float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 skyLin = pow(uSkyTint, vec3(2.2)) * uDaylight;
    col = mix(col, skyLin, f * 0.6);
    // sun glitter
    vec3 r = reflect(-v, n);
    float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0) * uSunStrength * vLight.x;
    col += vec3(1.0, 0.95, 0.8) * spec * 0.8;
    alpha = min(1.0, alpha + f * 0.35 + spec * 0.5);
#endif
  }
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  vec3 fogCol = uFogColor;
#ifdef GODRAY
  {
    // the fog near the sun picks up the sun colour so distant terrain glows towards it
    vec3 v = normalize(-vViewDir);
    float sd = max(dot(v, normalize(uSunDir)), 0.0);
    fogCol += vec3(1.0, 0.75, 0.45) * pow(sd, 8.0) * 0.35 * uSunStrength;
  }
#endif
  col = mix(col, fogCol, fog);
  if (uWater == 1) alpha = mix(alpha, 1.0, fog);
#ifdef GRADE
  {
    // gentle filmic grade: S-curve contrast, warm highlights / cool shadows, tiny saturation lift
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 1.08);
    col = col * (1.0 + 0.10 * l) - 0.012;
    col += (vec3(0.02, 0.012, -0.01) * l - vec3(0.008, 0.004, -0.012) * (1.0 - l)) * (1.0 - fog);
  }
#endif
  // sRGB encode -- UNLESS this frame is being rendered into PostFX's linear render target, in
  // which case the composite pass performs the single encode. Encoding here as well raised
  // midtones by ~41% (linear 0.25 came out at 0.75 instead of 0.53), which is what washed the
  // world out whenever shaders were on. PostFX's own comment always claimed this define existed;
  // it never did, so the double encode shipped silently.
#ifndef LINEAR_OUT
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
#endif
  gl_FragColor = vec4(col, alpha);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunset;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunsetAmount;
uniform float uVoid;
uniform float uGlow;
uniform float uNight;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uTop, t);
  if (h < 0.0) col = mix(uHorizon, uTop * 0.4, clamp(-h * 3.0, 0.0, 1.0));
  float sd = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
  float glow = pow(sd, 6.0) * uSunsetAmount * (1.0 - clamp(h * 3.0, 0.0, 1.0));
  col = mix(col, uSunset, glow * 0.85);
  col += vec3(1.0, 0.9, 0.7) * pow(sd, 90.0) * 0.5;
  // shader-pack sun halo (uGlow = 0 when shaders are off)
  col += vec3(1.0, 0.85, 0.6) * pow(sd, 14.0) * 0.35 * uGlow;
  col += vec3(1.0, 0.95, 0.85) * pow(sd, 400.0) * 1.2 * uGlow;
  // moon halo: a cold glow around the moon disc, strongest at deep night (cheap: no derivatives)
  float md = max(0.0, dot(normalize(vDir), normalize(uMoonDir)));
  col += vec3(0.62, 0.72, 0.95) * pow(md, 260.0) * 0.85 * uNight;
  col += vec3(0.45, 0.55, 0.85) * pow(md, 24.0) * 0.10 * uNight * uGlow;
  // night sky keeps a whisper of blue in the horizon band so the ground line reads against the stars
  if (uNight > 0.0) col = mix(col, col * vec3(0.92, 0.96, 1.12) + vec3(0.0, 0.004, 0.014), uNight * 0.6 * (1.0 - abs(h)));
  if (uVoid > 0.5) {
    float bands = sin(vDir.x * 12.0 + vDir.y * 20.0) * 0.5 + 0.5;
    col += vec3(0.2, 0.05, 0.3) * bands * 0.3;
  }
  // uniforms are linear working-space colours; encode for the sRGB canvas
#ifdef LINEAR_OUT
  gl_FragColor = vec4(max(col, 0.0), 1.0);   // PostFX composites and encodes
#else
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
#endif
}
`;

/** Individually switchable shader-pack features (all off = the plain renderer). */
export interface ShaderFeatures {
  waving: boolean;
  water: boolean;
  grade: boolean;
  sunlight: boolean;
  godrays: boolean;
  /**
   * True while the frame is rendered into PostFX's linear render target. The material then writes
   * LINEAR colour and the composite pass performs the single sRGB encode. Without this the encode
   * happened twice (once here, once in PostFX), lifting midtones ~41%.
   */
  linearOut: boolean;
}

export const SHADERS_OFF: ShaderFeatures = { waving: false, water: false, grade: false, sunlight: false, godrays: false, linearOut: false };

export function createChunkMaterial(atlas: THREE.Texture, water: boolean, features: ShaderFeatures = SHADERS_OFF): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: CHUNK_VERT,
    fragmentShader: CHUNK_FRAG,
    uniforms: {
      uAtlas: { value: atlas },
      // half a texel, in atlas-cell units: keeps the per-block uv wrap off the cell border
      uTexelInset: { value: new THREE.Vector2(0.5 / TILE_PX, 0.5 / TILE_PX) },
      uDaylight: { value: 1 },
      uFogColor: { value: new THREE.Color(0xc0d8ff) },
      uFogNear: { value: 60 },
      uFogFar: { value: 100 },
      uSkyTint: { value: new THREE.Color(0xc0d8ff) },
      uSunDir: { value: new THREE.Vector3(0.4, 1, 0.25) },
      uSunStrength: { value: 1 },
      uBrightness: { value: 0 },
      uWater: { value: water ? 1 : 0 },
      uTime: { value: 0 },
      uWind: { value: 0 },
    },
    transparent: water,
    depthWrite: !water,
    side: water ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.extensions = { ...m.extensions, derivatives: true } as typeof m.extensions;
  setShaderFeatures(m, features);
  return m;
}

/** Recompile a chunk material with a new feature set (cheap: only the #defines change). */
export function setShaderFeatures(m: THREE.ShaderMaterial, f: ShaderFeatures): void {
  const defines: Record<string, string> = {};
  if (f.waving) defines.WAVE = '1';
  if (f.water) defines.WATER_FX = '1';
  if (f.grade) defines.GRADE = '1';
  if (f.sunlight) defines.SUNLIGHT = '1';
  if (f.godrays) defines.GODRAY = '1';
  // set while PostFX is active: the material writes LINEAR values and the composite pass encodes
  if (f.linearOut) defines.LINEAR_OUT = '1';
  const same = Object.keys(defines).length === Object.keys(m.defines ?? {}).length && Object.keys(defines).every((k) => m.defines?.[k] !== undefined);
  if (same) return;
  m.defines = defines;
  m.needsUpdate = true;
}
