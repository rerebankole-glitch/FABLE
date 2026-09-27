import { build } from 'esbuild';
await build({ entryPoints: ['tests/blade.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/blade.test.mjs', logLevel: 'warning' });
