import { build } from 'esbuild';
await build({ entryPoints: ['tests/handmodel.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/handmodel.test.mjs', logLevel: 'warning', target: 'node20' });
