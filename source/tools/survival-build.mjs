import { build } from 'esbuild';
await build({ entryPoints: ['tests/survival.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/survival.test.mjs', logLevel: 'warning' });
