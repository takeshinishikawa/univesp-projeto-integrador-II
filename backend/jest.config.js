/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  clearMocks: true,
  // Cobertura só com `npm test -- --coverage` (o CI usa). O ponto de entrada e a
  // documentação do Swagger ficam de fora: não têm lógica para testar.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/index.ts', '!src/docs/**'],
  coverageReporters: ['text-summary', 'html', 'lcov'],
};
