import { build } from 'esbuild';
await build({ entryPoints: ['tests/building.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/building.test.mjs', logLevel: 'warning' });
