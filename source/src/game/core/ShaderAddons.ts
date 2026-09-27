import { settings } from './Settings';

export interface ShaderAddonFeatures {
  waving: boolean;
  water: boolean;
  grade: boolean;
  sunlight: boolean;
  godrays: boolean;
  bloom: boolean;
  vignette: boolean;
}

export interface ShaderAddonTuning {
  colorTemp: number;        // -1.0 .. 1.0 (cool to warm)
  bloomStrength: number;    // 0.0 .. 1.0 (bloom intensity)
  vignetteStrength: number; // 0.0 .. 1.0 (vignette darkness)
  brightness: number;       // 0.0 .. 1.0 (gamma lift)
}

export interface ShaderAddon {
  formatVersion: 1;
  id: string;
  name: string;
  author: string;
  description: string;
  features: ShaderAddonFeatures;
  tuning: ShaderAddonTuning;
}

export const DEFAULT_SHADER_ADDONS: ShaderAddon[] = [
  {
    formatVersion: 1,
    id: 'vanilla_plus',
    name: 'Vanilla Enhanced',
    author: 'FABLE Studio',
    description: 'Subtle waving foliage and animated water ripples that preserve the classic pixel aesthetic.',
    features: { waving: true, water: true, grade: false, sunlight: true, godrays: false, bloom: false, vignette: false },
    tuning: { colorTemp: 0, bloomStrength: 0.2, vignetteStrength: 0.2, brightness: 0 },
  },
  {
    formatVersion: 1,
    id: 'amber_twilight',
    name: 'Amber Twilight',
    author: 'FABLE Community',
    description: 'Golden hour atmosphere with rich warm highlights, vibrant foliage sway, and soft sunset rays.',
    features: { waving: true, water: true, grade: true, sunlight: true, godrays: true, bloom: true, vignette: true },
    tuning: { colorTemp: 0.45, bloomStrength: 0.35, vignetteStrength: 0.3, brightness: 0.05 },
  },
  {
    formatVersion: 1,
    id: 'alpine_crisp',
    name: 'Alpine Crisp',
    author: 'Glacier Modding',
    description: 'Cool mountain air, crystalline water reflections, subtle bloom, and crisp sunlit ridges.',
    features: { waving: true, water: true, grade: true, sunlight: true, godrays: true, bloom: true, vignette: false },
    tuning: { colorTemp: -0.35, bloomStrength: 0.25, vignetteStrength: 0.15, brightness: 0.08 },
  },
  {
    formatVersion: 1,
    id: 'midnight_veil',
    name: 'Midnight Veil',
    author: 'Shadow Works',
    description: 'Mystical moonlight with deep shadows, cool chromatic temperature, and focused peripheral vignette.',
    features: { waving: true, water: true, grade: true, sunlight: false, godrays: false, bloom: true, vignette: true },
    tuning: { colorTemp: -0.5, bloomStrength: 0.4, vignetteStrength: 0.45, brightness: 0 },
  },
  {
    formatVersion: 1,
    id: 'vibrant_fantasy',
    name: 'Vibrant Fantasy',
    author: 'Aetherial Pack',
    description: 'Vivid saturated colours, dancing grass, gentle godrays, and radiant floral bloom.',
    features: { waving: true, water: true, grade: true, sunlight: true, godrays: true, bloom: true, vignette: true },
    tuning: { colorTemp: 0.2, bloomStrength: 0.45, vignetteStrength: 0.25, brightness: 0.1 },
  },
  {
    formatVersion: 1,
    id: 'retro_sepia',
    name: 'Retro Sepia',
    author: 'Vintage Pixels',
    description: 'Nostalgic warm film grading with heavy vignette and soft contrast curves.',
    features: { waving: false, water: true, grade: true, sunlight: true, godrays: false, bloom: false, vignette: true },
    tuning: { colorTemp: 0.65, bloomStrength: 0.1, vignetteStrength: 0.5, brightness: 0.02 },
  },
  {
    formatVersion: 1,
    id: 'performance_lite',
    name: 'Performance Lite',
    author: 'Fast Track',
    description: 'Optimized profile for laptops and mobile GPUs: waving leaves and water enabled with no post-processing overhead.',
    features: { waving: true, water: true, grade: false, sunlight: true, godrays: false, bloom: false, vignette: false },
    tuning: { colorTemp: 0, bloomStrength: 0, vignetteStrength: 0, brightness: 0 },
  },
];

/**
 * Validates untrusted raw JSON against the Safe Shader Add-on specification.
 * Protects against code execution, prototype pollution, type confusion, and out-of-bounds parameters.
 */
export function validateShaderAddon(raw: unknown): { ok: true; addon: ShaderAddon } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Add-on must be a valid JSON object.'] };
  }

  const obj = raw as Record<string, unknown>;

  // Disallow forbidden prototype keys
  for (const forbidden of ['__proto__', 'constructor', 'prototype']) {
    if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
      return { ok: false, errors: [`Dangerous property "${forbidden}" is not allowed.`] };
    }
  }

  // Version check
  if (obj.formatVersion !== 1) {
    errors.push('Unsupported formatVersion. Expected formatVersion: 1.');
  }

  // Identity strings
  const id = typeof obj.id === 'string' && /^[a-z0-9_-]{1,32}$/i.test(obj.id) ? obj.id.toLowerCase() : 'custom_addon';
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 64) : '';
  if (!name) errors.push('Field "name" is required (string up to 64 chars).');

  const author = typeof obj.author === 'string' ? obj.author.trim().slice(0, 64) : 'Anonymous';
  const description = typeof obj.description === 'string' ? obj.description.trim().slice(0, 256) : '';

  // Feature flags
  if (!obj.features || typeof obj.features !== 'object' || Array.isArray(obj.features)) {
    errors.push('Field "features" must be an object with boolean flags.');
  }

  const feat = (obj.features ?? {}) as Record<string, unknown>;
  const boolVal = (val: unknown, fallback: boolean) => (typeof val === 'boolean' ? val : fallback);

  const features: ShaderAddonFeatures = {
    waving: boolVal(feat.waving, true),
    water: boolVal(feat.water, true),
    grade: boolVal(feat.grade, true),
    sunlight: boolVal(feat.sunlight, true),
    godrays: boolVal(feat.godrays, true),
    bloom: boolVal(feat.bloom, true),
    vignette: boolVal(feat.vignette, true),
  };

  // Numeric tuning parameters clamped to safe bounds
  const tune = (obj.tuning ?? {}) as Record<string, unknown>;
  const clampNum = (val: unknown, min: number, max: number, fallback: number) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
    return Math.max(min, Math.min(max, val));
  };

  const tuning: ShaderAddonTuning = {
    colorTemp: clampNum(tune.colorTemp, -1, 1, 0),
    bloomStrength: clampNum(tune.bloomStrength, 0, 1, 0.28),
    vignetteStrength: clampNum(tune.vignetteStrength, 0, 1, 0.24),
    brightness: clampNum(tune.brightness, 0, 1, 0),
  };

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const addon: ShaderAddon = {
    formatVersion: 1,
    id,
    name,
    author,
    description,
    features,
    tuning,
  };

  return { ok: true, addon };
}

export function importShaderAddonFromJson(jsonStr: string): { ok: true; addon: ShaderAddon } | { ok: false; errors: string[] } {
  try {
    const parsed = JSON.parse(jsonStr);
    return validateShaderAddon(parsed);
  } catch (err) {
    return { ok: false, errors: ['Invalid JSON syntax: ' + (err instanceof Error ? err.message : String(err))] };
  }
}

export function exportShaderAddonJson(addon: ShaderAddon): string {
  return JSON.stringify(addon, null, 2);
}

export function currentSettingsAsAddon(name = 'My Custom Shaders'): ShaderAddon {
  const s = settings.value;
  return {
    formatVersion: 1,
    id: 'current_custom',
    name,
    author: s.playerName || 'Player',
    description: 'Custom shader configuration tuned from FABLE in-game settings.',
    features: {
      waving: s.shaderWaving,
      water: s.shaderWater,
      grade: s.shaderGrade,
      sunlight: s.shaderSunlight,
      godrays: s.shaderGodrays,
      bloom: s.shaderBloom,
      vignette: s.shaderVignette,
    },
    tuning: {
      colorTemp: s.shaderColorTemp,
      bloomStrength: 0.28,
      vignetteStrength: 0.24,
      brightness: s.brightness,
    },
  };
}

export function applyShaderAddon(addon: ShaderAddon, game?: { applySettings(): void } | null): void {
  settings.set('shaders', true);
  settings.set('shaderWaving', addon.features.waving);
  settings.set('shaderWater', addon.features.water);
  settings.set('shaderGrade', addon.features.grade);
  settings.set('shaderSunlight', addon.features.sunlight);
  settings.set('shaderGodrays', addon.features.godrays);
  settings.set('shaderBloom', addon.features.bloom);
  settings.set('shaderVignette', addon.features.vignette);
  settings.set('shaderColorTemp', addon.tuning.colorTemp);
  settings.set('brightness', addon.tuning.brightness);
  if (game) game.applySettings();
}
