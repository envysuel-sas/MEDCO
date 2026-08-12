// ESLint — la règle qui compte ici est l'interdiction de `console.*` sur un
// objet `prise`, `produit` ou `profil` (§15). Elle n'est pas exprimable
// statiquement de façon fiable : `no-console` est donc général, avec une
// dérogation pour le pipeline et les scripts, qui n'ont pas d'objet métier.

import js from '@eslint/js';
import globals from 'globals';
import typescript from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default typescript.config(
  { ignores: ['dist/**', 'node_modules/**', '.venv/**', '.cache/**', 'coverage/**'] },
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'worker/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'src/**/__tests__/**/*.ts'],
    // Les scripts Playwright portent du code qui s'exécute dans la page —
    // `page.evaluate`, `addInitScript` — d'où les globales du navigateur en
    // plus de celles de Node.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
);
