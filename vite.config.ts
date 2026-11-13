/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

// Left out of the React Compiler: components that read opengeoweb's WMLayer
// objects (dimensions, styles, legend urls) while rendering - directly, or
// through a helper like getHistogramUrl. Those objects are changed in place,
// outside React, so the compiler - which caches a render's output for as
// long as its props and state stay the same - would keep showing their old
// contents.
const READS_MUTABLE_WMLAYER = [
  'src/components/LayerComponent/LayerComponent.tsx',
  'src/components/WMSComponents/WMSDimensionSlider.tsx',
  'src/connectedcomponents/AnimationClock.tsx',
  'src/connectedcomponents/LayerDetailsComponent/',
  'src/connectedcomponents/ReduxMapViewComponent.tsx',
  'src/connectedcomponents/SideTools/LegendPanel.tsx',
  'src/connectedcomponents/SideTools/TimePanel.tsx',
  'src/connectedcomponents/SideTools/query/',
];

// The app's own code only - not the tests, whose stand-in components read
// state the test changes in between renders.
const compileWithReactCompiler = (filename: string): boolean =>
  filename.includes('/src/') &&
  !/\.test\.tsx?$/.test(filename) &&
  !filename.includes('/src/testUtils/') &&
  !READS_MUTABLE_WMLAYER.some((path) => filename.includes(`/${path}`));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset({ sources: compileWithReactCompiler })],
    }),
  ],
  // Relative asset URLs, so the same build works from a sub-path (GitHub
  // Pages project site) and from the root (the nginx Docker image).
  base: './',
  // Copied as-is next to index.html; config.json is read at runtime (and
  // overwritten by the Docker entrypoint).
  publicDir: 'static',
  define: {
    // When this bundle was built, shown in the About dialog. Fixed in tests.
    __BUILD_DATE__: JSON.stringify(
      mode === 'test' ? '1970-01-01T00:00:00.000Z' : new Date().toISOString(),
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The app is a single page that needs OpenLayers, MUI and the opengeoweb
    // packages up front; splitting them only adds requests.
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 4000,
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
