// Builds the resource-pack mapping + free-pack art integrity suite (tests/pack.test.ts).
// It was written but never wired into `npm test`; this makes it part of the suite.
import { build } from 'esbuild';
await build({
  entryPoints: ['tests/pack.test.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: 'dist/packmap.test.mjs', logLevel: 'warning', target: 'node20',
  external: ['@napi-rs/canvas'],
});
