import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { actions, createAppStore } from '../../store/store';
import { ViewerState, AdagucLayer } from '../../store/types';
import LegendPanel from './LegendPanel';

interface MockStyle {
  name: string;
  legendURL: string;
  title: string;
  abstract: string;
}

interface MockWMLayer {
  id: string;
  legendGraphic: string;
  currentStyle: string;
  getStyles: () => MockStyle[];
  setStyle: (styleName: string) => void;
}

const mockGetWMLayerById = vi.fn<(id: string) => MockWMLayer | undefined>();

vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: (id: string) => mockGetWMLayerById(id),
  // A simplified stand-in for the real getLegendGraphicURLForLayer, which
  // this test only needs to read layer.legendGraphic from (the dims/SLD/
  // width/height extras it also appends aren't relevant to this bug).
  getLegendGraphicURLForLayer: (layer: MockWMLayer | undefined) =>
    layer?.legendGraphic || undefined,
  legendImageStore: { clear: vi.fn() },
}));

vi.mock('@opengeoweb/webmap-react', () => ({
  clearImageCacheForAllMaps: vi.fn(),
}));

const STYLES: MockStyle[] = [
  {
    name: 'style-a',
    legendURL: 'https://example.com/legend-a.png',
    title: 'A',
    abstract: '',
  },
  {
    name: 'style-b',
    legendURL: 'https://example.com/legend-b.png',
    title: 'B',
    abstract: '',
  },
];

// Mirrors the real WMLayer.setStyle: on a match, mutate legendGraphic/
// currentStyle to that style; otherwise fall back to the first style.
const makeMockWMLayer = (initialStyle: string): MockWMLayer => {
  const wmLayer: MockWMLayer = {
    id: 'layer-1',
    legendGraphic: '',
    currentStyle: '',
    getStyles: () => STYLES,
    setStyle: (styleName) => {
      const match = STYLES.find((style) => style.name === styleName);
      const resolved = match ?? STYLES[0];
      wmLayer.legendGraphic = resolved.legendURL;
      wmLayer.currentStyle = resolved.name;
    },
  };
  wmLayer.setStyle(initialStyle);
  return wmLayer;
};

const mapId = 'map1';
const serviceUrl = 'https://example.com/wms?';

const makeLayer = (overrides: Partial<AdagucLayer> = {}): AdagucLayer => ({
  id: 'layer-1',
  name: 'layer-1',
  serviceUrl,
  style: 'style-a',
  dimensions: [],
  enabled: true,
  opacity: 1,
  ...overrides,
});

// The layer's service is in the store too, advertising both styles - the
// changeLayerStyle reducer only accepts a style name the service lists.
const buildState = (layers: AdagucLayer[]): ViewerState => ({
  viewer: {
    services: {
      [serviceUrl]: {
        id: serviceUrl,
        serviceUrl,
        layers: [{ name: 'layer-1', leaf: true, path: [], styles: STYLES }],
      },
    },
    baseLayers: [],
    maps: {
      [mapId]: {
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        layers,
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  },
});

// Renders the panel inside a real store starting from `state`.
const renderPanel = (state: ViewerState) => {
  const store = createAppStore(state);
  render(
    <Provider store={store}>
      <LegendPanel mapId={mapId} />
    </Provider>,
  );
  return store;
};

describe('LegendPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the legend image for the layer's current style", async () => {
    const wmLayer = makeMockWMLayer('style-a');
    mockGetWMLayerById.mockReturnValue(wmLayer);

    renderPanel(buildState([makeLayer({ style: 'style-a' })]));

    expect(await screen.findByAltText('Legend for layer-1')).toHaveAttribute(
      'src',
      expect.stringContaining('legend-a.png'),
    );
  });

  it('updates the legend image when the layer style changes, even if nothing else has synced the WMLayer yet', async () => {
    const wmLayer = makeMockWMLayer('style-a');
    mockGetWMLayerById.mockReturnValue(wmLayer);

    const store = renderPanel(buildState([makeLayer({ style: 'style-a' })]));
    expect(await screen.findByAltText('Legend for layer-1')).toHaveAttribute(
      'src',
      expect.stringContaining('legend-a.png'),
    );

    // The style dropdown's redux update - note nothing here calls
    // wmLayer.setStyle('style-b') the way the real map layer's own effect
    // normally would, which is exactly the race the panel must not depend
    // on.
    act(() => {
      store.dispatch(
        actions.changeLayerStyle({
          mapId,
          layerIndex: 0,
          styleName: 'style-b',
        }),
      );
    });
    expect(store.getState().viewer.maps[mapId].layers[0].style).toBe('style-b');

    expect(await screen.findByAltText('Legend for layer-1')).toHaveAttribute(
      'src',
      expect.stringContaining('legend-b.png'),
    );
  });
});
