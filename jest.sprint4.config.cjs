module.exports = {
  rootDir: __dirname,
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/*.spec.ts"],
  moduleFileExtensions: ["js", "json", "ts", "mjs"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.spec.json"
      }
    ]
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/",
    "<rootDir>/src/modules/actions/actions/",
    "<rootDir>/src/modules/events/events/",
    "<rootDir>/prisma/migrations/migrations/",
    "<rootDir>/src/generated/prisma/prisma/"
  ],
  testPathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/",
    "<rootDir>/src/modules/actions/actions/",
    "<rootDir>/src/modules/events/events/"
  ],
  watchPathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/"
  ]
};