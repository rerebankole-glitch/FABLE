import { build } from 'esbuild';
await build({ entryPoints: ['tools/trisbench.mts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/trisbench.mjs', logLevel: 'warning' });
