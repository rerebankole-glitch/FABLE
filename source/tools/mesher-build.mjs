import { build } from 'esbuild';
await build({ entryPoints: ['tests/mesher.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/mesher.test.mjs', logLevel: 'warning' });
