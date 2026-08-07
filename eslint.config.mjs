import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    ignores: ['**/{lib,dist,bundles,node_modules}/**/*.*'],
  },
])
