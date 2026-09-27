import { build } from 'esbuild';
await build({ entryPoints: ['tests/validate.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/validate.test.mjs', logLevel: 'warning', target: 'node20' });
