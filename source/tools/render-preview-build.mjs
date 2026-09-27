import { build } from 'esbuild';
await build({
  entryPoints: ['tools/render-preview.mjs'],
  bundle: true, platform: 'node', format: 'esm', outfile: 'dist/render-preview.mjs',
  loader: { '.ts': 'ts' }, logLevel: 'warning',
});
