module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/server/tests/setupEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.js'],
  testMatch: ['<rootDir>/server/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/controllers/auth.controller.js',
    'src/controllers/joinRequest.controller.js',
    'src/services/pricing.service.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  clearMocks: true,
  restoreMocks: true,
};
