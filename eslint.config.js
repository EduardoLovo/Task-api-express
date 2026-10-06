const { defineConfig, globalIgnores } = require('eslint/config');
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  globalIgnores(['coverage/', 'data/']),

  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Parâmetros com _ podem ficar sem uso (ex.: o "next" que o Express exige no error handler).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-throw-literal': 'error',
    },
  },

  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: globals.jest },
  },

  // Desliga as regras de estilo que o Prettier já cuida (evita conflito entre os dois).
  prettier,
]);
