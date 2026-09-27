import { build } from 'esbuild';
await build({ entryPoints: ['tests/brewing.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/brewing.test.mjs', logLevel: 'warning' });
