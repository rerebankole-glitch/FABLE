import { build } from 'esbuild';
await build({
  entryPoints: ['tools/dom-market-smoke.tsx'],
  bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/dom-market-smoke.cjs',
  jsx: 'automatic', logLevel: 'error', external: ['jsdom'],
  define: { 'import.meta.url': '"file:///home/user/FABLE/source/src/ui/SkinMarketplace.tsx"' },
  plugins: [{
    name: 'stub-vite',
    setup(b) {
      b.onResolve({ filter: /\?(worker|inline|url)/ }, (args) => ({ path: args.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export default function Stub(){ return { postMessage(){}, terminate(){}, addEventListener(){}, removeEventListener(){} } }',
        loader: 'js',
      }));
    },
  }],
});
