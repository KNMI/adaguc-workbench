// This file has been automatically migrated to valid ESM format by Storybook.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');

/** @type { import('@storybook/react-webpack5').StorybookConfig } */
const config = {
  stories: [
    '../stories/**/*.stories.mdx',
    '../stories/**/*.stories.@(js|jsx|ts|tsx)',
  ],

  addons: ['@storybook/addon-links', '@storybook/addon-mcp', '@storybook/addon-docs'],

  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },

  // Storybook's own TypeScript auto-detection isn't picking up .tsx story
  // files here (they come back with no babel/ts loader applied at all,
  // so the TS-only return-type syntax in ReduxStoreTest.stories.tsx fails
  // to parse) - apply the same babel-loader rule (and the same Node-core
  // fallbacks) the app's own webpack.config.js uses.
  webpackFinal: (storybookConfig) => {
    // eslint-disable-next-line no-param-reassign
    storybookConfig.resolve.fallback = {
      ...storybookConfig.resolve.fallback,
      fs: false,
      net: false,
    };
    storybookConfig.module.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      exclude: /node_modules/,
      use: ['babel-loader'],
    });
    // __BUILD_DATE__ is normally stamped in by the app's own
    // webpack.config.js (read by AdagucAboutDialog) - without it here too,
    // any story that renders that component throws a ReferenceError.
    storybookConfig.plugins.push(
      new webpack.DefinePlugin({
        __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      }),
    );
    return storybookConfig;
  }
};
export default config;
