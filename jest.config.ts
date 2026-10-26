import type { Config } from 'jest';

const config: Config = {
  roots: ['<rootDir>/src', '<rootDir>/test/unit'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/e2e/'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\.spec\.(ts|mjs)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'mts', 'cts', 'mjs'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        useESM: true,
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  moduleDirectories: ['node_modules'],
};

export default config;
