import {
  LayerType,
  WMLayer,
  generateLayerId,
  getWMSServiceId,
  queryWMSLayers,
} from '@opengeoweb/webmap';
import { thunks } from './thunks';
import { ViewerState } from './types';

jest.mock('@opengeoweb/webmap', () => ({
  queryWMSLayers: jest.fn(),
  getWMSServiceId: jest.fn(() => 'service-1'),
  generateLayerId: jest.fn(() => 'fake-layer-id'),
  LayerType: { mapLayer: 'mapLayer' },
  WMLayer: jest.fn(),
}));

const mockQueryWMSLayers = jest.mocked(queryWMSLayers);
const mockGetWMSServiceId = jest.mocked(getWMSServiceId);
const mockGenerateLayerId = jest.mocked(generateLayerId);
const mockWMLayer = jest.mocked(WMLayer);

const mapId = 'map1';
const serviceUrl = 'http://localhost:8080/adagucserver?dataset=test&';

// createAsyncThunk's action creator, when called with an argument, returns
// a thunk function - this is the standard way to exercise one directly,
// without needing a full store: dispatch re-invokes any thunk function it
// is given, and just returns plain actions (pending/fulfilled/rejected)
// as-is, since nothing here needs those applied to real reducer state.
const runThunk = async <T>(
  thunkAction: (
    dispatch: never,
    getState: () => ViewerState,
    extra: unknown,
  ) => Promise<T>,
  state: ViewerState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const getState = (): ViewerState => state;
  const dispatch = (action: unknown): unknown =>
    typeof action === 'function'
      ? (action as (d: unknown, g: unknown, e: unknown) => unknown)(
          dispatch,
          getState,
          undefined,
        )
      : action;
  return thunkAction(dispatch as never, getState, undefined);
};

const emptyState: ViewerState = {
  viewer: { services: {}, maps: {}, baseLayers: [] },
};

describe('thunks.addLayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWMSServiceId.mockReturnValue('service-1');
    mockGenerateLayerId.mockReturnValue('fake-layer-id');
    mockQueryWMSLayers.mockResolvedValue([]);
  });

  it('still adds the layer, using the requested name, when the service lists no layers at all', async () => {
    // Regression guard: some services (e.g. the ADAGUC wikgeneric test
    // dataset) don't enumerate their layers via GetCapabilities even
    // though a given layer works fine - this used to reject outright,
    // silently dropping the layer instead of showing it in the panel.
    mockQueryWMSLayers.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
      this.dimensions = [];
      this.parseLayer = jest.fn().mockResolvedValue(undefined);
      this.setStyle = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await runThunk(
      thunks.addLayer({
        mapId,
        serviceUrl,
        name: 'air_pressure_msl',
        enabled: true,
        opacity: 1,
      }),
      emptyState,
    );

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(result.payload).toMatchObject({
      name: 'air_pressure_msl',
      serviceUrl,
      mapId,
      dimensions: [],
      hasError: false,
    });
  });

  it('keeps a layer requested as disabled (e.g. from a permalink) disabled', async () => {
    // Regression guard: this used to be `enabled || true`, which turned the
    // layer back on in redux while the WMLayer itself stayed disabled.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
      this.dimensions = [];
      this.parseLayer = jest.fn().mockResolvedValue(undefined);
      this.setStyle = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const disabled = await runThunk(
      thunks.addLayer({ mapId, serviceUrl, name: 'a', enabled: false }),
      emptyState,
    );
    const unspecified = await runThunk(
      thunks.addLayer({ mapId, serviceUrl, name: 'a' }),
      emptyState,
    );

    expect(disabled.payload.enabled).toBe(false);
    expect(unspecified.payload.enabled).toBe(true);
  });

  it('still adds the layer, with empty dimensions, when it cannot be parsed', async () => {
    // Regression guard: a layer the service genuinely doesn't have (wrong
    // name, since-removed, etc.) used to reject the whole thunk - this now
    // adds it anyway (with no dimensions) so it still shows in the panel,
    // consistent with the empty-capabilities case above.
    mockQueryWMSLayers.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'some_other_layer', styles: [{ name: 'default' }] } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
      this.dimensions = [];
      this.parseLayer = jest
        .fn()
        .mockRejectedValue(new Error('Layer not found'));
      this.setStyle = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await runThunk(
      thunks.addLayer({
        mapId,
        serviceUrl,
        name: 'total_precipitation_rate_gl',
        enabled: true,
        opacity: 1,
      }),
      emptyState,
    );

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(result.payload).toMatchObject({
      name: 'total_precipitation_rate_gl',
      serviceUrl,
      mapId,
      dimensions: [],
      hasError: true,
    });
  });

  it('builds the WMLayer with LayerType.mapLayer and the generated id', async () => {
    mockQueryWMSLayers.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
      this.dimensions = [];
      this.parseLayer = jest.fn().mockResolvedValue(undefined);
      this.setStyle = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await runThunk(
      thunks.addLayer({
        mapId,
        serviceUrl,
        name: 'air_pressure_msl',
        enabled: true,
        opacity: 1,
      }),
      emptyState,
    );

    expect(mockWMLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fake-layer-id',
        name: 'air_pressure_msl',
        service: serviceUrl,
        layerType: LayerType.mapLayer,
      }),
    );
  });

  describe('when the service is unreachable', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('still adds the layer, within the timeout, instead of hanging on GetCapabilities', async () => {
      // Regression guard: @opengeoweb/webmap retries a failed GetCapabilities
      // request (e.g. an unreachable service) 3 times with exponential
      // backoff before giving up, which can take far longer than feels
      // responsive. addLayer now races that against a fixed timeout instead
      // of waiting it out, so an unreachable service still results in the
      // layer showing up (named as requested, with no dimensions) quickly.
      mockQueryWMSLayers.mockReturnValue(new Promise(() => {}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
        this.dimensions = [];
        this.parseLayer = jest.fn().mockResolvedValue(undefined);
        this.setStyle = jest.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const resultPromise = runThunk(
        thunks.addLayer({
          mapId,
          serviceUrl,
          name: 'air_pressure_msl',
          enabled: true,
          opacity: 1,
        }),
        emptyState,
      );

      await jest.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      expect(result.meta.requestStatus).toBe('fulfilled');
      expect(result.payload).toMatchObject({
        name: 'air_pressure_msl',
        serviceUrl,
        mapId,
        dimensions: [],
        hasError: false,
      });
    });

    it('still adds the layer, within the timeout, instead of hanging on parseLayer', async () => {
      mockQueryWMSLayers.mockResolvedValue([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWMLayer.mockImplementation(function MockWMLayer(this: any) {
        this.dimensions = [];
        this.parseLayer = jest.fn(() => new Promise(() => {}));
        this.setStyle = jest.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const resultPromise = runThunk(
        thunks.addLayer({
          mapId,
          serviceUrl,
          name: 'air_pressure_msl',
          enabled: true,
          opacity: 1,
        }),
        emptyState,
      );

      await jest.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      expect(result.meta.requestStatus).toBe('fulfilled');
      expect(result.payload).toMatchObject({
        name: 'air_pressure_msl',
        serviceUrl,
        mapId,
        dimensions: [],
        hasError: true,
      });
    });
  });
});
