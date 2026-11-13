/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../stories/**/*.stories.@(js|jsx|ts|tsx)'],

  addons: [
    '@storybook/addon-links',
    '@storybook/addon-mcp',
    '@storybook/addon-docs',
  ],

  // Builds with the app's own vite.config.ts (React plugin, the
  // __BUILD_DATE__ define), so stories compile exactly like the app.
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};
export default config;
