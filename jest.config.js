module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'packages/**/*.ts',
    '!packages/**/*.d.ts',
    '!packages/**/node_modules/**',
    '!packages/**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true,
  moduleNameMapper: {
    '^@CCR/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@CCR/(.*)$': '<rootDir>/packages/$1/src',
  },
};
