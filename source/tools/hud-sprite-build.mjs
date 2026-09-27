// Build + run the HUD sprite checker: node tools/hud-sprite-build.mjs
import { build } from 'esbuild';
await build({ entryPoints: ['tools/check-hud-sprites.mts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/check-hud-sprites.mjs', logLevel: 'error' });
await import('../dist/check-hud-sprites.mjs');
