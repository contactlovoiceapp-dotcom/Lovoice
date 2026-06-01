// Flat ESLint config using Expo's official preset. Lints app/ and src/ only;
// generated native folders, build output, and Deno edge functions are excluded.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'supabase/functions/**',
      'scripts/**',
      'babel.config.js',
      'metro.config.js',
      'jest.setup.ts',
      'eslint.config.js',
    ],
  },
  {
    rules: {
      // eslint-config-expo 56 ships eslint-plugin-react-hooks v6, whose experimental
      // React-Compiler rules flag deliberate, load-bearing patterns in this codebase:
      // ref-during-render and immutable-store updates in the single-instance audio
      // players (src/lib/feedPlayer.ts, chatMessagePlayer.ts), and set-state-in-effect
      // for the autoplay chaining. These are documented invariants (docs/CHAT_AUDIO.md)
      // and must not be auto-refactored. We disable the RC rules and keep the stable,
      // proven hooks rules (rules-of-hooks = error, exhaustive-deps = warn).
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
    },
  },
];
