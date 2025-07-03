// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  {
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      stylistic.configs['disable-legacy'],
      stylistic.configs.recommended,
    ],
    rules: {
      "@stylistic/max-len": ["error", 140, 2, {
        "ignoreTemplateLiterals": true,
      }],
      "@stylistic/quote-props": ["error", "as-needed"],
      "@stylistic/brace-style": ["error", "1tbs"],
      "@typescript-eslint/no-unsafe-member-access": ["warn"],
      "@typescript-eslint/unbound-method": ["error", {
        "ignoreStatic": true,
      }],
      "@typescript-eslint/no-misused-promises": ["error", {
        "checksVoidReturn": false,
      }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true,
        }
      ]
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['./eslint.config.js', '**/node_modules', '**/dist', "knexfile.js"]
  }
);