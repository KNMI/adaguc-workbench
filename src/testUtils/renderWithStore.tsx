import * as React from 'react';
import { Provider } from 'react-redux';
import { RenderResult, render } from '@testing-library/react';
import { createAppStore } from '../store/store';
import { AdagucMap, ViewerState } from '../store/types';

// A map with nothing on it - spread into a test's own state and override
// what it needs.
export const emptyMap = (overrides: Partial<AdagucMap> = {}): AdagucMap => ({
  layers: [],
  isAnimating: false,
  isGetFeatureInfoActive: false,
  isHistogramBoxSelectActive: false,
  view: {
    srs: 'EPSG:3857',
    bbox: { left: -1, bottom: -1, right: 1, top: 1 },
  },
  ...overrides,
});

// Renders `ui` inside a fresh, real redux store (the app's own reducers,
// not hand-written stand-ins), so a test can both start from a given
// state and check what actually ended up in it.
export const renderWithStore = (
  ui: React.ReactElement,
  maps: ViewerState['viewer']['maps'] = {},
): RenderResult & { store: ReturnType<typeof createAppStore> } => {
  const store = createAppStore({
    viewer: { maps, services: {}, baseLayers: [] },
  });
  return {
    store,
    ...render(<Provider store={store}>{ui}</Provider>),
  };
};
