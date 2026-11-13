declare let config: Config;

interface Config {
  wmsServiceUrl: string;
  wmsBaseLayerService: string;
}

// Injected by webpack's DefinePlugin at build time (see webpack.config.js) -
// an ISO 8601 timestamp of when this bundle was built. Named with the
// conventional double-underscore wrapping for a build-time constant
// (matches e.g. __DEV__), not a private member.
declare const __BUILD_DATE__: string;
