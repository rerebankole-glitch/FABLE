import { build } from 'esbuild';
await build({ entryPoints: ['tests/gamma.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/gamma.test.mjs', logLevel: 'warning' });
