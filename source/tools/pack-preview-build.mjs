import { build } from 'esbuild';
await build({
  entryPoints: ['tests/pack-preview.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: 'dist/pack-preview.mjs', logLevel: 'warning', target: 'node20',
  external: ['@napi-rs/canvas'],
});
