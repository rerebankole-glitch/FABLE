import {
  validateShaderAddon,
  importShaderAddonFromJson,
  exportShaderAddonJson,
  DEFAULT_SHADER_ADDONS,
  type ShaderAddon,
} from '../src/game/core/ShaderAddons';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
  c ? pass++ : fail++;
};

// 1. Check default presets
ok('shader addons: default list has multiple presets', DEFAULT_SHADER_ADDONS.length >= 5);
for (const addon of DEFAULT_SHADER_ADDONS) {
  const res = validateShaderAddon(addon);
  ok(`shader preset "${addon.name}": passes validation`, res.ok);
}

// 2. Export / import roundtrip
const first = DEFAULT_SHADER_ADDONS[0];
const json = exportShaderAddonJson(first);
const imported = importShaderAddonFromJson(json);
ok('shader addons: JSON export/import round-trips successfully', imported.ok);
if (imported.ok) {
  ok('shader addons: round-trip preserves name', imported.addon.name === first.name);
  ok('shader addons: round-trip preserves waving feature', imported.addon.features.waving === first.features.waving);
  ok('shader addons: round-trip preserves bloom tuning', imported.addon.tuning.bloomStrength === first.tuning.bloomStrength);
}

// 3. Security: Reject prototype pollution and dangerous properties
const dangerousPayload = JSON.parse('{"formatVersion":1,"name":"Exploit","features":{},"tuning":{},"__proto__":{"polluted":true}}');
const dangerRes = validateShaderAddon(dangerousPayload);
ok('shader addons: rejects __proto__ property injection', !dangerRes.ok);

// 4. Clamping: Verify out-of-bounds numbers are safely clamped
const uncalibrated = {
  formatVersion: 1,
  id: 'test_clamp',
  name: 'Test Clamped',
  author: 'Tester',
  description: 'Out of bounds values',
  features: { waving: true, water: false, grade: true, sunlight: true, godrays: false, bloom: true, vignette: false },
  tuning: {
    colorTemp: 999.0, // should clamp to 1.0
    bloomStrength: -50.0, // should clamp to 0.0
    vignetteStrength: 25.0, // should clamp to 1.0
    brightness: -1.0, // should clamp to 0.0
  },
};
const clampRes = validateShaderAddon(uncalibrated);
ok('shader addons: accepts out-of-bounds tuning with clamping', clampRes.ok);
if (clampRes.ok) {
  ok('shader addons: colorTemp clamped to 1.0', clampRes.addon.tuning.colorTemp === 1.0);
  ok('shader addons: bloomStrength clamped to 0.0', clampRes.addon.tuning.bloomStrength === 0.0);
  ok('shader addons: vignetteStrength clamped to 1.0', clampRes.addon.tuning.vignetteStrength === 1.0);
  ok('shader addons: brightness clamped to 0.0', clampRes.addon.tuning.brightness === 0.0);
}

// 5. Schema validation error reporting
const invalidVersion = { formatVersion: 99, name: 'Bad Version', features: {}, tuning: {} };
const verRes = validateShaderAddon(invalidVersion);
ok('shader addons: reports unsupported formatVersion error', !verRes.ok && verRes.errors.some((e) => e.includes('formatVersion')));

const missingName = { formatVersion: 1, name: '', features: {}, tuning: {} };
const nameRes = validateShaderAddon(missingName);
ok('shader addons: reports missing name error', !nameRes.ok && nameRes.errors.some((e) => e.includes('name')));

const syntaxErr = importShaderAddonFromJson('not valid json at all');
ok('shader addons: gracefully reports JSON syntax error', !syntaxErr.ok && syntaxErr.errors.some((e) => e.includes('syntax')));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
