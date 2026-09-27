import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Runtime-safety lint rules; TypeScript handles types and unused identifiers separately.
export default [
  { ignores: ['dist/**', 'site-dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'constructor-super': 'error',
    },
  },
];
