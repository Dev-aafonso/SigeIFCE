import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\.spec\.ts$',

  moduleFileExtensions: ['ts', 'js', 'json', 'mts', 'cts'],

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

  collectCoverageFrom: [
    'src/**/*.ts',
  ],

  coverageDirectory: './coverage',

  moduleDirectories: [
    'node_modules',
  ],
};

export default config;
