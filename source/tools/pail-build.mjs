import { build } from 'esbuild';
await build({ entryPoints: ['tests/pail.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/pail.test.mjs', logLevel: 'warning' });
