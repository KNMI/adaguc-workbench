/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
  },
  // These packages ship only ES modules, which Jest (running CommonJS) can't
  // load untranspiled - babel-jest transpiles them like our own code, so
  // tests can use the real store, @opengeoweb/webmap and ol. Not covered:
  // @opengeoweb/webmap-react, which needs a real canvas as soon as it's
  // imported - tests of map components keep mocking it.
  transformIgnorePatterns: [
    '/node_modules/(?!(@opengeoweb|ol|rbush|quickselect|quick-lru|earcut)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  // Stands in for webpack's DefinePlugin substitution (see
  // webpack.config.js), which jest never runs.
  globals: {
    __BUILD_DATE__: '1970-01-01T00:00:00.000Z',
  },
};
