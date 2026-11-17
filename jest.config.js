export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  moduleFileExtensions: ['js'],
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/**/*.min.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};