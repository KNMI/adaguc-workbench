import { produce } from 'immer';
import { reducers } from './reducers';
import { AdagucMapsState } from './types';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
}));

describe('reducers.setGetFeatureInfoActive', () => {
  const mapId = 'map1';

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        layers: [],
        isAnimating: false,
        isGetFeatureInfoActive: true,
        isHistogramBoxSelectActive: false,
        mapPinLocation: { lat: 1, lon: 2 },
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  it('toggles isGetFeatureInfoActive without clearing the pin location', () => {
    // Regression guard: GetFeatureInfo and TimeSeries both read
    // mapPinLocation, and switching between their tabs deactivates one of
    // them without the pin itself having moved. This used to clear the pin
    // on every deactivate, erasing whichever panel wasn't currently shown.
    const state = buildState();

    reducers.setGetFeatureInfoActive(state, {
      payload: { mapId, active: false },
    });

    expect(state.maps[mapId].isGetFeatureInfoActive).toBe(false);
    expect(state.maps[mapId].mapPinLocation).toEqual({ lat: 1, lon: 2 });
  });

  it('does nothing when the map is not registered', () => {
    const state: AdagucMapsState = { services: {}, maps: {}, baseLayers: [] };

    expect(() =>
      reducers.setGetFeatureInfoActive(state, {
        payload: { mapId: 'missing', active: true },
      }),
    ).not.toThrow();
    expect(state.maps).toEqual({});
  });
});

describe('command requestIds (requestSetProjection / requestZoomToLayer / requestAutoWMSService)', () => {
  const mapId = 'map1';
  const bbox = { left: 0, bottom: 0, right: 1, top: 1 };

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        layers: [],
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        view: { srs: 'EPSG:3857', bbox },
      },
    },
  });

  it('gives every command a new requestId, even one repeating the previous payload', () => {
    const state = buildState();

    reducers.requestZoomToLayer(state, { payload: { mapId, layerId: 'a' } });
    const firstZoom = state.maps[mapId].zoomToLayerCommand?.requestId;
    reducers.requestSetProjection(state, {
      payload: { mapId, srs: 'EPSG:4326', bbox },
    });
    const projection = state.maps[mapId].viewCommand?.requestId;
    reducers.requestAutoWMSService(state, { payload: { service: 'x' } });
    const autoWMS = state.autoWMSServiceCommand?.requestId;
    // Zooming to the same layer again must still be seen as a new command.
    reducers.requestZoomToLayer(state, { payload: { mapId, layerId: 'a' } });
    const secondZoom = state.maps[mapId].zoomToLayerCommand?.requestId;

    expect([firstZoom, projection, autoWMS, secondZoom]).toEqual([1, 2, 3, 4]);
  });

  it('counts per store state rather than in module-level state shared by all of them', () => {
    // Regression guard: the counter used to be a module-level variable,
    // so these ids depended on whatever other states had done before.
    const first = buildState();
    reducers.requestZoomToLayer(first, { payload: { mapId, layerId: 'a' } });
    reducers.requestZoomToLayer(first, { payload: { mapId, layerId: 'b' } });

    const second = buildState();
    reducers.requestZoomToLayer(second, { payload: { mapId, layerId: 'a' } });

    expect(second.maps[mapId].zoomToLayerCommand?.requestId).toBe(1);
  });
});

describe('reducers.setHistogramBoxSelectActive / setHistogramBox', () => {
  const mapId = 'map1';

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        layers: [],
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  it('toggles isHistogramBoxSelectActive', () => {
    const state = buildState();

    reducers.setHistogramBoxSelectActive(state, {
      payload: { mapId, active: true },
    });

    expect(state.maps[mapId].isHistogramBoxSelectActive).toBe(true);
  });

  it('stores the drawn box', () => {
    const state = buildState();
    const box = {
      bbox: { left: -600000, bottom: 2100000, right: 7600000, top: 8700000 },
      srs: 'EPSG:3857',
      pixelWidth: 190,
      pixelHeight: 959,
    };

    reducers.setHistogramBox(state, { payload: { mapId, box } });

    expect(state.maps[mapId].histogramBox).toEqual(box);
  });

  it('does nothing when the map is not registered', () => {
    const state: AdagucMapsState = { services: {}, maps: {}, baseLayers: [] };

    expect(() => {
      reducers.setHistogramBoxSelectActive(state, {
        payload: { mapId: 'missing', active: true },
      });
      reducers.setHistogramBox(state, {
        payload: {
          mapId: 'missing',
          box: {
            bbox: { left: 0, bottom: 0, right: 1, top: 1 },
            srs: 'EPSG:3857',
            pixelWidth: 256,
            pixelHeight: 256,
          },
        },
      });
    }).not.toThrow();
    expect(state.maps).toEqual({});
  });
});

describe('reducers.setBaseLayerEnabled', () => {
  const buildState = (): AdagucMapsState => ({
    services: {},
    maps: {},
    baseLayers: [
      {
        id: 'baselayer-worldmap',
        name: 'WorldMap',
        title: 'KNMI Basemap',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layerType: 'baseLayer' as any,
        enabled: true,
      },
      {
        id: 'overlay-countryborders',
        name: 'countryborders',
        title: 'World country borders',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layerType: 'overLayer' as any,
        enabled: false,
      },
    ],
  });

  it('toggles only the matching base layer by id', () => {
    const state = buildState();

    reducers.setBaseLayerEnabled(state, {
      payload: { id: 'overlay-countryborders', enabled: true },
    });

    expect(state.baseLayers[0].enabled).toBe(true);
    expect(state.baseLayers[1].enabled).toBe(true);

    reducers.setBaseLayerEnabled(state, {
      payload: { id: 'baselayer-worldmap', enabled: false },
    });

    expect(state.baseLayers[0].enabled).toBe(false);
    expect(state.baseLayers[1].enabled).toBe(true);
  });

  it('does nothing when no base layer matches the given id', () => {
    const state = buildState();

    expect(() =>
      reducers.setBaseLayerEnabled(state, {
        payload: { id: 'missing', enabled: true },
      }),
    ).not.toThrow();
    expect(state.baseLayers.map((l) => l.enabled)).toEqual([true, false]);
  });
});

describe('reducers.fullFillAddLayer', () => {
  const mapId = 'map1';
  const serviceUrl = 'http://localhost:8080/adagucserver?dataset=test&';

  const buildState = (): AdagucMapsState => ({
    services: {},
    maps: {},
    baseLayers: [],
  });

  it('adds the layer even when the service lists no layers at all', () => {
    // Regression guard: some services (e.g. the ADAGUC wikgeneric test
    // dataset) don't enumerate their layers via GetCapabilities even
    // though a given layer works fine. This used to require an exact
    // match there before inserting anything, silently dropping the layer
    // from the panel whenever that lookup came up empty.
    const state = buildState();

    reducers.fullFillAddLayer(state, {
      payload: {
        mapId,
        name: 'air_pressure_msl',
        serviceUrl,
        id: 'layer-1',
        dimensions: [],
        enabled: true,
        styleName: 'pressure_cwk',
        opacity: 1,
        hasError: true,
      },
    });

    expect(state.maps[mapId].layers).toEqual([
      {
        name: 'air_pressure_msl',
        enabled: true,
        serviceUrl,
        id: 'layer-1',
        style: 'pressure_cwk',
        dimensions: [],
        opacity: 1,
        hasError: true,
        isReady: false,
      },
    ]);
  });

  it('falls back to the matched layer default style when none was requested', () => {
    const state = buildState();
    state.services['service-1'] = {
      id: 'service-1',
      serviceUrl,
      layers: [
        {
          name: 'air_pressure_msl',
          styles: [{ name: 'pressure_default' }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    };

    reducers.fullFillAddLayer(state, {
      payload: {
        mapId,
        name: 'air_pressure_msl',
        serviceUrl,
        id: 'layer-1',
        dimensions: [],
        enabled: true,
        opacity: 1,
      },
    });

    expect(state.maps[mapId].layers[0].style).toBe('pressure_default');
  });

  it('does not crash on a second dispatch for the same service, when run through Immer like the real store does', () => {
    // Regression guard: this reducer used to look up the service's layers
    // via the memoized selectors.getAvailableLayers, fed the raw Immer
    // draft state directly. Reselect's cache then held a reference into
    // that draft; once this reducer's own produce() call finished, Immer
    // revoked the draft's proxy, and the *next* dispatch crashed trying
    // to compare its new args against that now-revoked reference
    // ("Cannot perform 'IsArray' on a proxy that has been revoked").
    // Calling the reducer directly on a plain object (as every other test
    // in this file does) never exercises this - only a real producer
    // (createSlice wraps every reducer in one) creates the Proxy that can
    // later be revoked, hence the real immer produce() calls below.
    const state = buildState();
    state.services['service-1'] = {
      id: 'service-1',
      serviceUrl,
      layers: [{ name: 'air_pressure_msl', styles: [] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const payload = (id: string) => ({
      mapId,
      name: 'air_pressure_msl',
      serviceUrl,
      id,
      dimensions: [],
      enabled: true,
      opacity: 1,
    });

    const afterFirst = produce(state, (draft) => {
      reducers.fullFillAddLayer(draft, { payload: payload('layer-1') });
    });

    expect(() => {
      produce(afterFirst, (draft) => {
        reducers.fullFillAddLayer(draft, { payload: payload('layer-2') });
      });
    }).not.toThrow();
  });
});

describe('reducers.syncAnimatedLayerDimension', () => {
  const mapId = 'map1';

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        isAnimating: true,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        layers: [
          {
            id: 'layer-1',
            name: 'air_pressure_msl',
            serviceUrl: 'http://localhost:8080/adagucserver',
            style: 'default',
            dimensions: [
              { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
            ],
            enabled: true,
            opacity: 1,
          },
        ],
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  it('updates the dimension value without turning animation off', () => {
    // Regression guard: the sidebar time slider reads a layer's redux-
    // tracked dimensions, but useAnimationForLayer's own ticking never
    // touched redux, so the slider never followed an animation. This syncs
    // it in - and must not use changeLayerDimension's reducer for that,
    // since that one always flips isAnimating off (correct for a user
    // dragging the slider, but would stop the very animation it's syncing).
    const state = buildState();

    reducers.syncAnimatedLayerDimension(state, {
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T05:00:00Z',
      },
    });

    expect(state.maps[mapId].layers[0].dimensions).toEqual([
      { name: 'time', currentValue: '2025-01-01T05:00:00Z' },
    ]);
    expect(state.maps[mapId].isAnimating).toBe(true);
  });

  it('does nothing when the layer index does not exist', () => {
    const state = buildState();

    expect(() =>
      reducers.syncAnimatedLayerDimension(state, {
        payload: {
          mapId,
          layerIndex: 5,
          dimensionName: 'time',
          dimensionValue: '2025-01-01T05:00:00Z',
        },
      }),
    ).not.toThrow();
    expect(state.maps[mapId].layers[0].dimensions).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
  });
});

describe('reducers.changeLayerDimension', () => {
  const mapId = 'map1';

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        isAnimating: true,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        layers: [
          {
            id: 'layer-1',
            name: 'air_pressure_msl',
            serviceUrl: 'http://localhost:8080/adagucserver',
            style: 'default',
            dimensions: [
              { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
            ],
            enabled: true,
            opacity: 1,
          },
          {
            id: 'layer-2',
            name: 'air_temperature',
            serviceUrl: 'http://localhost:8080/adagucserver',
            style: 'default',
            dimensions: [
              {
                name: 'time',
                currentValue: '2025-01-01T00:00:00Z',
                linked: true,
              },
            ],
            enabled: true,
            opacity: 1,
          },
          {
            id: 'layer-3',
            name: 'wind_speed',
            serviceUrl: 'http://localhost:8080/adagucserver',
            style: 'default',
            dimensions: [
              // Not linked - must not follow.
              { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
            ],
            enabled: true,
            opacity: 1,
          },
        ],
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  it('propagates the new value to other layers whose matching dimension is linked, but not unlinked ones', () => {
    // Regression guard: this mimics the webmap's old map-level dimension
    // linking (see WMSDimensionSlider's "link" checkbox) - a redux-tracked
    // flag, not the live WMLayer's own (non-reactive) dimension object.
    const state = buildState();

    reducers.changeLayerDimension(state, {
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T05:00:00Z',
      },
    });

    expect(state.maps[mapId].layers[0].dimensions[0].currentValue).toBe(
      '2025-01-01T05:00:00Z',
    );
    expect(state.maps[mapId].layers[1].dimensions[0].currentValue).toBe(
      '2025-01-01T05:00:00Z',
    );
    expect(state.maps[mapId].layers[2].dimensions[0].currentValue).toBe(
      '2025-01-01T00:00:00Z',
    );
  });

  it('turns animation off', () => {
    const state = buildState();

    reducers.changeLayerDimension(state, {
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T05:00:00Z',
      },
    });

    expect(state.maps[mapId].isAnimating).toBe(false);
  });
});

describe('reducers.setLayerDimensionLinked', () => {
  const mapId = 'map1';

  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        layers: [
          {
            id: 'layer-1',
            name: 'air_pressure_msl',
            serviceUrl: 'http://localhost:8080/adagucserver',
            style: 'default',
            dimensions: [
              { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
            ],
            enabled: true,
            opacity: 1,
          },
        ],
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  it('sets linked to true, then back to false', () => {
    const state = buildState();

    reducers.setLayerDimensionLinked(state, {
      payload: { mapId, layerIndex: 0, dimensionName: 'time', linked: true },
    });
    expect(state.maps[mapId].layers[0].dimensions[0].linked).toBe(true);

    reducers.setLayerDimensionLinked(state, {
      payload: { mapId, layerIndex: 0, dimensionName: 'time', linked: false },
    });
    expect(state.maps[mapId].layers[0].dimensions[0].linked).toBe(false);
  });

  it('does nothing when the dimension does not exist on the layer', () => {
    const state = buildState();

    expect(() =>
      reducers.setLayerDimensionLinked(state, {
        payload: {
          mapId,
          layerIndex: 0,
          dimensionName: 'elevation',
          linked: true,
        },
      }),
    ).not.toThrow();
    expect(state.maps[mapId].layers[0].dimensions).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
  });

  it('does nothing when the layer index does not exist', () => {
    const state = buildState();

    expect(() =>
      reducers.setLayerDimensionLinked(state, {
        payload: { mapId, layerIndex: 5, dimensionName: 'time', linked: true },
      }),
    ).not.toThrow();
  });
});

describe('reducers: layers that are missing or unknown', () => {
  const mapId = 'map1';
  const layer = (id: string): AdagucMapsState['maps'][string]['layers'][0] => ({
    id,
    name: `name-${id}`,
    serviceUrl: 'https://example.com/wms?',
    enabled: true,
    style: '',
    opacity: 1,
    dimensions: [],
  });
  const buildState = (): AdagucMapsState => ({
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        layers: [layer('a'), layer('b')],
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('setLayerOrderByIds skips an id that is not on the map instead of leaving a hole', () => {
    const state = buildState();

    reducers.setLayerOrderByIds(state, {
      payload: { mapId, layerListIds: ['b', 'gone', 'a'] },
    });

    expect(state.maps[mapId].layers.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('changeLayerStyle does nothing for a layer index that does not exist', () => {
    const state = buildState();

    expect(() =>
      reducers.changeLayerStyle(state, {
        payload: { mapId, layerIndex: 5, styleName: 'x' },
      }),
    ).not.toThrow();
  });

  it("changeLayerName leaves the layer alone when its service isn't loaded", () => {
    const state = buildState();

    expect(() =>
      reducers.changeLayerName(state, {
        payload: { mapId, layerIndex: 0, layerName: 'other' },
      }),
    ).not.toThrow();
    expect(state.maps[mapId].layers[0].name).toBe('name-a');
  });
});
