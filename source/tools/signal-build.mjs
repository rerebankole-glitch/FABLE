import { build } from 'esbuild';
await build({ entryPoints: ['tests/signal.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/signal.test.mjs', logLevel: 'warning' });
