// Colour-space correctness for the shader pack.
//
// The world materials and the PostFX composite pass must agree on WHO performs the single sRGB
// encode. They did not: the chunk and sky shaders always encoded, and PostFX encoded again on top,
// so with shaders on every midtone was lifted ~41% (linear 0.25 reached 0.75 instead of 0.53) and
// the world looked washed out. PostFX's own comment claimed a LINEAR_OUT define handled this; the
// define did not exist. These checks pin the contract so it cannot silently regress again.
import { CHUNK_FRAG, SKY_FRAG, SHADERS_OFF, type ShaderFeatures } from '../src/game/renderer/Shaders';
import { shaderFeatures, postFxActive, DEFAULT_SETTINGS, type Settings } from '../src/game/core/Settings';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? pass++ : fail++; };

// ---- the shaders must guard their encode behind the define
ok('chunk shader guards its sRGB encode with LINEAR_OUT', /#ifndef\s+LINEAR_OUT[\s\S]*?1\.0 \/ 2\.2[\s\S]*?#endif/.test(CHUNK_FRAG));
ok('sky shader guards its sRGB encode with LINEAR_OUT', /#ifdef\s+LINEAR_OUT/.test(SKY_FRAG) && /1\.0 \/ 2\.2/.test(SKY_FRAG));
ok('chunk shader encodes exactly once in its source', (CHUNK_FRAG.match(/1\.0 \/ 2\.2/g) ?? []).length === 1);

// ---- the flag must track the PostFX predicate exactly, across the whole settings space
const mk = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...o } as Settings);
const CASES: [string, Partial<Settings>][] = [
  ['shaders off',                 { shaders: false }],
  ['shaders off + bloom on',      { shaders: false, shaderBloom: true }],
  ['shaders on, no post effects', { shaders: true, shaderBloom: false, shaderVignette: false, shaderColorTemp: 0 }],
  ['shaders on + bloom',          { shaders: true, shaderBloom: true, shaderVignette: false, shaderColorTemp: 0 }],
  ['shaders on + vignette',       { shaders: true, shaderBloom: false, shaderVignette: true, shaderColorTemp: 0 }],
  ['shaders on + colour temp',    { shaders: true, shaderBloom: false, shaderVignette: false, shaderColorTemp: 0.5 }],
  ['shaders on + everything',     { shaders: true, shaderBloom: true, shaderVignette: true, shaderColorTemp: -0.5 }],
];
for (const [label, patch] of CASES) {
  const s = mk(patch);
  const f = shaderFeatures(s);
  ok(`${label}: linearOut matches postFxActive`, f.linearOut === postFxActive(s), `linearOut=${f.linearOut} postFx=${postFxActive(s)}`);
  // exactly one encode happens: either the material does it, or PostFX does -- never both, never neither
  const encodes = (f.linearOut ? 0 : 1) + (postFxActive(s) ? 1 : 0);
  ok(`${label}: colour is sRGB-encoded exactly once`, encodes === 1, `encodes=${encodes}`);
}

// ---- the off-state must be complete (a missing key would silently read as undefined/false)
ok('SHADERS_OFF declares linearOut', 'linearOut' in SHADERS_OFF);
const keys: (keyof ShaderFeatures)[] = ['waving', 'water', 'grade', 'sunlight', 'godrays', 'linearOut'];
for (const k of keys) ok(`shaderFeatures() always returns '${k}'`, k in shaderFeatures(mk({ shaders: false })));

// ---- the numeric consequence the bug actually caused
const enc = (v: number) => Math.pow(v, 1 / 2.2);
const lin = 0.25;
ok('double encoding really does wash out midtones (the bug being prevented)',
  Math.abs(enc(enc(lin)) - enc(lin)) > 0.2, `single=${enc(lin).toFixed(3)} double=${enc(enc(lin)).toFixed(3)}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
