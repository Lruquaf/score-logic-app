import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    // React Compiler is not enabled. Keep the pre-Next-16 lint contract until
    // compiler adoption is handled as its own measured UI refactor.
    rules: {
      'react-hooks/error-boundaries': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    // Expo's web entry uses React Native Web rather than the Next.js router.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: { '@next/next/no-html-link-for-pages': 'off' }
  },
  globalIgnores([
    '.next/**',
    '.next-dev/**',
    '.next-dev.stale/**',
    '.local/**',
    '.backups/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'apps/mobile/.expo/**',
    'apps/mobile/dist/**',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
    'next-env.d.ts'
  ])
])
