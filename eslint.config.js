const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'tests/output/**',
      'tests/unit-build/**',
      'scripts/**',
    ],
  },
];
