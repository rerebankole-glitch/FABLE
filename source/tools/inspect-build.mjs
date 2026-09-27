import { build } from 'esbuild';
await build({ entryPoints: ['tools/inspect-skins.mjs'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/inspect-skins.mjs', logLevel: 'warning' });
