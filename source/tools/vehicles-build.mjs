import { build } from 'esbuild';
await build({ entryPoints: ['tests/vehicles.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/vehicles.test.mjs', logLevel: 'warning' });
