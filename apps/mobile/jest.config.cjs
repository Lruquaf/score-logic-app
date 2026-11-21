const preset = require('jest-expo/jest-preset')
module.exports = {
  preset: 'jest-expo',
  testEnvironmentOptions: { customExportConditions: ['react-native', 'expo-source'] },
  transform: { ...preset.transform, '\\.mjs$': preset.transform['\\.[jt]sx?$'] },
  testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@react-navigation/.*|@scorelogic/.*|react-native-.*)/)'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.ts$': '$1' },
  maxWorkers: 2
}
