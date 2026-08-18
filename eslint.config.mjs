import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    // Legacy UI currently relies on imperative effects and refs. Keep the
    // remaining Next.js/React rules active while this debt is migrated.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off'
    }
  },
  globalIgnores([
    '.next/**',
    'coverage/**',
    'dist/**',
    'node_modules/**',
    'out/**',
    'supabase/functions/**'
  ])
]);
