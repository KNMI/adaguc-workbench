import * as React from 'react';
import {
  act,
  fireEvent,
  render as renderWithoutQueryClient,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { useAppDispatch, useAppSelector } from '../../store/store';
import { AdagucLayer, ViewerState } from '../../store/types';
import { getFeatureInfoUrl } from '../../utils/getFeatureInfoUrl';
import {
  getTimeDimensionRange,
  getTimeSeriesUrl,
} from '../../utils/getTimeSeriesUrl';
import { getHistogramUrl } from '../../utils/getHistogramUrl';
import QueryPanel from './QueryPanel';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
}));

// The url builders are stubbed so each test controls exactly which
// requests the panel makes - building real ones (they have their own tests)
// would need a fully parsed WMLayer behind every layer here.
jest.mock('../../utils/getFeatureInfoUrl', () => ({
  getFeatureInfoUrl: jest.fn(),
}));
jest.mock('../../utils/getTimeSeriesUrl', () => ({
  getTimeSeriesUrl: jest.fn(),
  // Used only to compute what the two range fields show before the user
  // sets their own override - not what any of these tests are about.
  getTimeDimensionRange: jest.fn(),
  DEFAULT_MAX_TIME_STEPS: 64,
}));
jest.mock('../../utils/getHistogramUrl', () => ({
  getHistogramUrl: jest.fn(),
}));

jest.mock('../../store/store', () => ({
  actions: {
    changeLayerDimension: (payload: unknown) => ({
      type: 'wmsservices/changeLayerDimension',
      payload,
    }),
    setHistogramBoxSelectActive: (payload: unknown) => ({
      type: 'wmsservices/setHistogramBoxSelectActive',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

// recharts renders real SVG geometry based on measured DOM layout, which
// jsdom doesn't provide, so hit-testing a click to the right data point
// can't be exercised this way. Standing in for LineChart/BarChart with
// plain divs lets these tests focus on what is actually ours to verify.
let mockClickedChartLabel: string | undefined;
jest.mock('recharts', () => {
  /* eslint-disable
     @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-explicit-any */
  const ReactLib = require('react');
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      children,
    LineChart: ({ children, onClick }: any) =>
      ReactLib.createElement(
        'div',
        {
          'data-testid': 'timeseries-chart',
          onClick: () => onClick?.({ activeLabel: mockClickedChartLabel }),
        },
        children,
      ),
    BarChart: ({ children, data }: any) =>
      ReactLib.createElement(
        'div',
        { 'data-testid': 'histogram-chart', 'data-bin-count': data.length },
        children,
      ),
    Bar: () => null,
    Line: ({ dataKey, strokeOpacity }: any) =>
      ReactLib.createElement('div', {
        'data-testid': `line-${String(dataKey)}`,
        'data-stroke-opacity': strokeOpacity,
      }),
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    // QueryPanel passes its own SeriesLegend element (a real component,
    // not part of recharts) as `content` - rendering it as-is here, like
    // recharts' own `isValidElement(content)` branch does, lets these
    // tests interact with the real legend buttons it produces.
    Legend: ({ content }: any) =>
      ReactLib.isValidElement(content) ? content : null,
  };
  /* eslint-enable
     @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-explicit-any */
});

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = jest.mocked(getWMLayerById) as jest.MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockGetFeatureInfoUrl = jest.mocked(getFeatureInfoUrl);
const mockGetTimeSeriesUrl = jest.mocked(getTimeSeriesUrl);
const mockGetTimeDimensionRange = jest.mocked(getTimeDimensionRange);
const mockGetHistogramUrl = jest.mocked(getHistogramUrl);
const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockUseAppSelector = jest.mocked(useAppSelector);

const mapId = 'map1';
const layerId = 'layer-1';

const fakeLayer: AdagucLayer = {
  id: layerId,
  name: 'air_pressure_msl',
  serviceUrl: 'http://localhost:8080/adagucserver',
  style: 'default',
  dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
  enabled: true,
  opacity: 1,
};

const fakeMapPinLocation = {
  lat: 50,
  lon: 5,
  projectionX: 500000,
  projectionY: 6500000,
  resolution: 1000,
  srs: 'EPSG:3857',
};

const fakeHistogramBox = {
  bbox: { left: -1, bottom: -1, right: 1, top: 1 },
  srs: 'EPSG:3857',
  pixelWidth: 190,
  pixelHeight: 959,
};

const fakeTimeSeriesResponse = [
  {
    standard_name: 'air_pressure_at_mean_sea_level',
    units: 'hPa',
    data: {
      '2025-01-01T00:00:00Z': '1000.000000',
      '2025-01-01T01:00:00Z': '1001.000000',
    },
  },
];

const fakeMultiSeriesTimeSeriesResponse = [
  {
    standard_name: 'air_pressure_at_mean_sea_level',
    units: 'hPa',
    dims: ['member', 'time'],
    data: {
      '1': { '2025-01-01T00:00:00Z': '1000.000000' },
      '2': { '2025-01-01T00:00:00Z': '1002.000000' },
      '3': { '2025-01-01T00:00:00Z': '1004.000000' },
    },
  },
];

const fakeHistogramResponse = {
  air_pressure_msl: {
    numdatasources: 1,
    numdataobjects: 1,
    units: 'hPa',
    layername: 'air_pressure_msl',
    min: 989.1,
    max: 1024.3,
    average: 1005.2,
    stddev: 7.8,
    fieldmin: 989.1,
    fieldmax: 1024.3,
    interval: [989.1, 994.5],
    quantity: [120, 3400],
    width: [5.4, 5.4],
  },
};

// The panel fetches through React Query - a fresh client per test, so
// nothing cached by one test can leak into another.
let queryClient: QueryClient;
const render = (ui: React.ReactElement) =>
  renderWithoutQueryClient(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

describe('QueryPanel', () => {
  let mockDispatch: jest.Mock;
  let fakeState: ViewerState;

  const buildState = (
    overrides: Partial<ViewerState['viewer']['maps']['map1']> = {},
  ): ViewerState => ({
    viewer: {
      services: {},
      baseLayers: [],
      maps: {
        [mapId]: {
          isAnimating: false,
          isGetFeatureInfoActive: false,
          isHistogramBoxSelectActive: false,
          layers: [fakeLayer],
          view: {
            srs: 'EPSG:3857',
            bbox: { left: -1, bottom: -1, right: 1, top: 1 },
          },
          ...overrides,
        },
      },
    },
  });

  beforeEach(() => {
    queryClient = new QueryClient();
    mockDispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(mockDispatch);

    fakeState = buildState();
    mockUseAppSelector.mockImplementation((selector) => selector(fakeState));

    // jest.clearAllMocks() (below) only clears recorded calls, not a
    // previously configured mockReturnValue - without resetting this here
    // too, a custom getWMLayerById return value set by one test could
    // otherwise leak into a later one that never sets its own.
    mockGetWMLayerById.mockReturnValue(undefined);

    mockGetFeatureInfoUrl.mockReturnValue(
      'http://localhost:8080/adagucserver?mock=getfeatureinfo',
    );
    // Like the real one, the url reflects the pin and the requested range -
    // the panel fetches anew exactly when its request url changes.
    mockGetTimeSeriesUrl.mockImplementation(
      (_layer, location, _limits, timeRange) =>
        `http://localhost:8080/adagucserver?mock=timeseries` +
        `&lat=${location.lat}&lon=${location.lon}` +
        (timeRange ? `&TIME=${timeRange.start}/${timeRange.end}` : ''),
    );
    mockGetHistogramUrl.mockReturnValue(
      'http://localhost:8080/adagucserver?mock=histogram',
    );

    mockClickedChartLabel = '2025-01-01T01:00:00Z';
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  });

  it('fetches and renders GetFeatureInfo results for the clicked point by default', async () => {
    // GetFeatureInfo and TimeSeries both react to the same map-click pin,
    // so both fetch effects run here regardless of which subtab is shown -
    // the response needs to match each effect's own request url, since
    // TimeSeries now reads the body via .text() too (to recognise a
    // non-JSON OGC exception on failure) rather than only ever .json().
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);

    expect(
      screen.getByRole('button', { name: 'GetFeatureInfo' }).className,
    ).toContain('MuiButton-contained');
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/adagucserver?mock=getfeatureinfo',
      ),
    );
    expect(await screen.findByText('result')).toBeInTheDocument();
  });

  it('snaps a clicked time series point to the dimension and jumps the layer to it', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    const mockGetClosestValue = jest.fn().mockReturnValue(
      // A different value than what was clicked, to prove the snapped
      // value (not the raw click) is what ends up dispatched.
      '2025-01-01T01:30:00Z',
    );
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? { getClosestValue: mockGetClosestValue } : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    const chart = await waitFor(() => screen.getByTestId('timeseries-chart'));
    fireEvent.click(chart);

    expect(mockGetClosestValue).toHaveBeenCalledWith(
      '2025-01-01T01:00:00Z',
      true,
    );
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/changeLayerDimension',
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T01:30:00Z',
      },
    });
  });

  it('debounces a rapid burst of map-pin changes into a single TimeSeries request for the final one', async () => {
    // Regression guard: "Follow current time" (and rapid Start/End edits,
    // or just clicking around the map) can change what the TimeSeries
    // request should be several times within a fraction of a second -
    // without debouncing, each of those would fire its own request
    // instead of only the last one actually mattering.
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, text: () => Promise.resolve('{}') }),
      ) as unknown as typeof fetch;
      fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

      const { rerender } = render(<QueryPanel mapId={mapId} isActive />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
      });
      // Lets the initial mount's own (also debounced) fetch settle first,
      // so it isn't counted as part of the burst below. advanceTimersByTimeAsync
      // (rather than the sync advanceTimersByTime) also flushes the
      // microtasks the resulting fetch promise chain needs, so its own
      // state update isn't left dangling outside of act().
      await act(() => jest.advanceTimersByTimeAsync(500));
      (global.fetch as jest.Mock).mockClear();

      const timeSeriesFetchCount = (): number =>
        (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
          String(url).includes('mock=timeseries'),
        ).length;

      // Three rapid changes (e.g. three map-pin clicks, or "Follow current
      // time" ticking across three consecutive animation steps), each
      // still within the debounce window of the one before it.
      await act(() => jest.advanceTimersByTimeAsync(100));
      fakeState = buildState({
        mapPinLocation: { ...fakeMapPinLocation, lat: 51 },
      });
      rerender(<QueryPanel mapId={mapId} isActive />);

      await act(() => jest.advanceTimersByTimeAsync(100));
      fakeState = buildState({
        mapPinLocation: { ...fakeMapPinLocation, lat: 52 },
      });
      rerender(<QueryPanel mapId={mapId} isActive />);

      await act(() => jest.advanceTimersByTimeAsync(100));
      fakeState = buildState({
        mapPinLocation: { ...fakeMapPinLocation, lat: 53 },
      });
      rerender(<QueryPanel mapId={mapId} isActive />);

      // Still well within the debounce window since the last of the three
      // changes above.
      expect(timeSeriesFetchCount()).toBe(0);

      await act(() => jest.advanceTimersByTimeAsync(500));

      expect(timeSeriesFetchCount()).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the server own error message when a timeseries request fails', async () => {
    // Regression guard: a failed request (e.g. past the server's own
    // maxquerylimit) responds with a non-2xx status and an OGC
    // <ServiceExceptionReport> XML body, even when JSON was requested -
    // this used to be swallowed into a generic "Failed to load timeseries"
    // with the real reason only ever logged to the console.
    const serviceExceptionXml = `<?xml version='1.0' encoding="ISO-8859-1" standalone="no" ?>
<ServiceExceptionReport version="1.3.0">
  <ServiceException code="UnprocessableEntity">
    Requested data exceeded maxquerylimit=512;
  </ServiceException>
</ServiceExceptionReport>`;
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve(serviceExceptionXml),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    expect(
      await screen.findByText(
        /Failed to load timeseries: Requested data exceeded maxquerylimit=512/,
      ),
    ).toBeInTheDocument();
  });

  it('retries a failed timeseries request with every dimension scaled down when the server reports a maxquerylimit', async () => {
    // Regression guard: a request for the full time range can ask for
    // more cells than the server allows (time steps times every
    // wildcarded series dimension) - rather than leaving that as a dead
    // end, or only ever shrinking time, one retry scales every variable
    // dimension (time and member here) down together to fit the reported
    // limit.
    const serviceExceptionXml = `<?xml version='1.0' encoding="ISO-8859-1" standalone="no" ?>
<ServiceExceptionReport version="1.3.0">
  <ServiceException code="UnprocessableEntity">
    Requested data exceeded maxquerylimit=512;
  </ServiceException>
</ServiceExceptionReport>`;
    const timeDimension = { name: 'time', size: () => 1000 };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension, { name: 'member', size: () => 10 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeSeriesUrl.mockImplementation(
      (_layer, _location, dimensionLimits) =>
        dimensionLimits
          ? 'http://localhost:8080/adagucserver?mock=timeseries-retry'
          : 'http://localhost:8080/adagucserver?mock=timeseries',
    );
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries-retry')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
        });
      }
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve(serviceExceptionXml),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    // 1000 time steps * 10 members would ask for 10000 cells against a
    // limit of 512 - scale = sqrt(512/10000) ~= 0.2263, so the retry
    // should ask for floor(1000*scale)=226 time steps and
    // floor(10*scale)=2 members (226*2=452 <= 512).
    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { time: 226, member: 2 },
        undefined,
      );
    });
    expect(await screen.findByTestId('timeseries-chart')).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to load timeseries/),
    ).not.toBeInTheDocument();
  });

  it("shows the layer time dimension's own default range in the editable Start/End fields", async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockReturnValue({
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T05:00:00Z',
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T00:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-01-01T05:00:00Z');
    // No override set yet, so there's nothing to reset.
    expect(
      screen.queryByRole('button', { name: 'Auto' }),
    ).not.toBeInTheDocument();
    // Lets the GetFeatureInfo/TimeSeries fetches both triggered by this
    // pin resolve within the test's own act() scope.
    await screen.findByTestId('timeseries-chart');
  });

  it('applies an edited Start/End range as an override to the TimeSeries request, and resets it via Auto', async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockReturnValue({
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T05:00:00Z',
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    mockGetTimeSeriesUrl.mockClear();
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '2025-02-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '2025-02-02T00:00:00Z' },
    });
    fireEvent.blur(screen.getByLabelText('End'));

    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { start: '2025-02-01T00:00:00Z', end: '2025-02-02T00:00:00Z' },
      );
    });

    mockGetTimeSeriesUrl.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T00:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-01-01T05:00:00Z');
    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        undefined,
      );
    });
  });

  it('keeps the TimeSeries range override when switching to another subtab and back', () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockReturnValue({
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T05:00:00Z',
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });
    render(<QueryPanel mapId={mapId} isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '2025-02-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '2025-02-02T00:00:00Z' },
    });
    fireEvent.blur(screen.getByLabelText('End'));

    fireEvent.click(screen.getByRole('button', { name: 'GetFeatureInfo' }));
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));

    expect(screen.getByLabelText('Start')).toHaveValue('2025-02-01T00:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-02-02T00:00:00Z');
    expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument();
  });

  it('fetches the time series for a new pin while the GetFeatureInfo subtab is shown', async () => {
    // GetFeatureInfo and TimeSeries share the map-click pin: both are
    // fetched right away, so either is ready to switch to.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('mock=timeseries'),
      );
    });
    expect(screen.queryByTestId('timeseries-chart')).not.toBeInTheDocument();
  });

  it('does not commit a stale End value when Start is blurred by tabbing into End', async () => {
    // Regression guard: Start's own blur handler used to always commit
    // immediately, using whatever End currently held - tabbing/clicking
    // straight from Start into End blurs Start first, before End has been
    // edited, so that commit used to go out with End's old value, and the
    // override it set then re-synced (and so overwrote) whatever the user
    // typed into End next, before they could even blur it themselves.
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockReturnValue({
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T05:00:00Z',
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    const startField = screen.getByLabelText('Start');
    const endField = screen.getByLabelText('End');

    mockGetTimeSeriesUrl.mockClear();
    fireEvent.change(startField, { target: { value: '2025-02-01T00:00:00Z' } });
    fireEvent.blur(startField, { relatedTarget: endField });
    fireEvent.change(endField, { target: { value: '2025-02-02T00:00:00Z' } });
    fireEvent.blur(endField);

    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { start: '2025-02-01T00:00:00Z', end: '2025-02-02T00:00:00Z' },
      );
    });
    expect(mockGetTimeSeriesUrl).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { start: '2025-02-01T00:00:00Z', end: '2025-01-01T05:00:00Z' },
    );
  });

  it('reverts an unparsable Start/End edit instead of applying it', async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockReturnValue({
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T05:00:00Z',
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: 'not-a-date' },
    });
    fireEvent.blur(screen.getByLabelText('Start'));

    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T00:00:00Z');
    expect(
      screen.queryByRole('button', { name: 'Auto' }),
    ).not.toBeInTheDocument();
    // Lets the GetFeatureInfo/TimeSeries fetches both triggered by this
    // pin resolve within the test's own act() scope.
    await screen.findByTestId('timeseries-chart');
  });

  it('checking "Follow current time" centers the request on the reference layer\'s own current value, and disables manual editing', async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockImplementation(
      (_dimension: unknown, _maxSteps: unknown, centerValue?: string) =>
        centerValue
          ? { start: '2025-01-01T01:00:00Z', end: '2025-01-01T05:00:00Z' }
          : { start: '2025-01-01T00:00:00Z', end: '2025-01-01T06:00:00Z' },
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    // Automatic range before following - matches fakeLayer's own
    // currentValue, 2025-01-01T00:00:00Z, not being passed as a center.
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T00:00:00Z');

    mockGetTimeSeriesUrl.mockClear();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );

    expect(mockGetTimeDimensionRange).toHaveBeenCalledWith(
      timeDimension,
      64,
      '2025-01-01T00:00:00Z',
    );
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T01:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-01-01T05:00:00Z');
    expect(screen.getByLabelText('Start')).toBeDisabled();
    expect(screen.getByLabelText('End')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Auto' }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { start: '2025-01-01T01:00:00Z', end: '2025-01-01T05:00:00Z' },
      );
    });
  });

  it("tracks the layer's current value as it moves while following, refetching with the updated range", async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockImplementation(
      (_dimension: unknown, _maxSteps: unknown, centerValue?: string) =>
        centerValue
          ? {
              start: `${centerValue}-window-start`,
              end: `${centerValue}-window-end`,
            }
          : { start: '2025-01-01T00:00:00Z', end: '2025-01-01T06:00:00Z' },
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    const { rerender } = render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );

    mockGetTimeSeriesUrl.mockClear();
    // Simulates the layer's time stepping/animating forward - a new redux
    // state with a different currentValue, same as a real dimensionChange
    // dispatch would produce.
    fakeState = buildState({
      mapPinLocation: fakeMapPinLocation,
      layers: [
        {
          ...fakeLayer,
          dimensions: [{ name: 'time', currentValue: '2025-01-01T02:00:00Z' }],
        },
      ],
    });
    rerender(<QueryPanel mapId={mapId} isActive />);

    expect(screen.getByLabelText('Start')).toHaveValue(
      '2025-01-01T02:00:00Z-window-start',
    );
    await waitFor(() => {
      expect(mockGetTimeSeriesUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        {
          start: '2025-01-01T02:00:00Z-window-start',
          end: '2025-01-01T02:00:00Z-window-end',
        },
      );
    });
  });

  it('unchecking "Follow current time" freezes the fields at the last value following had, not the manual override from before', async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockImplementation(
      (_dimension: unknown, _maxSteps: unknown, centerValue?: string) =>
        centerValue
          ? { start: '2025-01-01T01:00:00Z', end: '2025-01-01T05:00:00Z' }
          : { start: '2025-01-01T00:00:00Z', end: '2025-01-01T06:00:00Z' },
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    // Set a manual override first.
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '2025-03-01T00:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '2025-03-02T00:00:00Z' },
    });
    fireEvent.blur(screen.getByLabelText('End'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument(),
    );

    // Following takes over, then gets unchecked again.
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T01:00:00Z');
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );

    // Frozen at following's own last range, not the earlier manual one -
    // and now editable again (an Auto button reappears, since this is
    // once again a manual override the user can reset from).
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T01:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-01-01T05:00:00Z');
    expect(screen.getByLabelText('Start')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument();
    // Lets every fetch triggered along the way resolve within the test's
    // own act() scope.
    await screen.findByTestId('timeseries-chart');
  });

  it('unchecking "Follow current time" with no prior manual override still freezes at the last followed value, not the automatic default', async () => {
    const timeDimension = { getClosestValue: jest.fn() };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockGetTimeDimensionRange.mockImplementation(
      (_dimension: unknown, _maxSteps: unknown, centerValue?: string) =>
        centerValue
          ? { start: '2025-01-01T01:00:00Z', end: '2025-01-01T05:00:00Z' }
          : { start: '2025-01-01T00:00:00Z', end: '2025-01-01T06:00:00Z' },
    );
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeTimeSeriesResponse)),
      }),
    ) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T00:00:00Z');

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T01:00:00Z');
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Follow current time' }),
    );

    // Stays at following's own last range rather than reverting to the
    // automatic default (2025-01-01T00:00:00Z) shown before following was
    // ever checked.
    expect(screen.getByLabelText('Start')).toHaveValue('2025-01-01T01:00:00Z');
    expect(screen.getByLabelText('End')).toHaveValue('2025-01-01T05:00:00Z');
    await screen.findByTestId('timeseries-chart');
  });

  it('dims every series but the one hovered in the legend', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(JSON.stringify(fakeMultiSeriesTimeSeriesResponse)),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });

    await screen.findByTestId('line-1');
    const legendItem1 = screen.getByRole('button', { name: 'member 1' });
    const legendItem2 = screen.getByRole('button', { name: 'member 2' });
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );

    fireEvent.mouseEnter(legendItem1);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
    // The hovered entry's own legend text is highlighted (bold, full
    // opacity) the same way, while the other entry is dimmed.
    expect(legendItem1).toHaveStyle({ fontWeight: '700', opacity: '1' });
    expect(legendItem2).toHaveStyle({ fontWeight: '400', opacity: '0.4' });

    fireEvent.mouseLeave(legendItem1);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(legendItem1).toHaveStyle({ fontWeight: '400', opacity: '1' });
    expect(legendItem2).toHaveStyle({ fontWeight: '400', opacity: '1' });
  });

  it('pins a series when its legend entry is clicked, staying dimmed after the mouse leaves', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(JSON.stringify(fakeMultiSeriesTimeSeriesResponse)),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });
    await screen.findByTestId('line-1');
    const legendItem1 = screen.getByRole('button', { name: 'member 1' });
    const legendItem2 = screen.getByRole('button', { name: 'member 2' });

    fireEvent.click(legendItem2);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(legendItem2).toHaveStyle({ fontWeight: '700', opacity: '1' });

    // The pin survives hovering a different series and moving away again.
    fireEvent.mouseEnter(legendItem1);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    fireEvent.mouseLeave(legendItem1);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );

    // Clicking the already-pinned entry again un-pins it.
    fireEvent.click(legendItem2);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
  });

  it('pins more than one legend entry at once, showing all of them', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('mock=timeseries')) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(JSON.stringify(fakeMultiSeriesTimeSeriesResponse)),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<b>result</b>'),
      });
    }) as unknown as typeof fetch;
    fakeState = buildState({ mapPinLocation: fakeMapPinLocation });

    render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'TimeSeries' }));
    });
    await screen.findByTestId('line-1');
    const legendItem1 = screen.getByRole('button', { name: 'member 1' });
    const legendItem2 = screen.getByRole('button', { name: 'member 2' });
    const legendItem3 = screen.getByRole('button', { name: 'member 3' });

    // Pinning a second entry adds to the pinned set rather than replacing
    // the first one.
    fireEvent.click(legendItem1);
    fireEvent.click(legendItem2);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-3')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
    expect(legendItem1).toHaveStyle({ fontWeight: '700', opacity: '1' });
    expect(legendItem2).toHaveStyle({ fontWeight: '700', opacity: '1' });
    expect(legendItem3).toHaveStyle({ fontWeight: '400', opacity: '0.4' });

    // Un-pinning just one leaves the other(s) pinned.
    fireEvent.click(legendItem1);
    expect(screen.getByTestId('line-1')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
    expect(screen.getByTestId('line-2')).toHaveAttribute(
      'data-stroke-opacity',
      '1',
    );
    expect(screen.getByTestId('line-3')).toHaveAttribute(
      'data-stroke-opacity',
      '0.15',
    );
  });

  it('shows the server own error message when a histogram request fails', async () => {
    const serviceExceptionXml = `<?xml version='1.0' encoding="ISO-8859-1" standalone="no" ?>
<ServiceExceptionReport version="1.3.0">
  <ServiceException code="UnprocessableEntity">
    Requested data exceeded maxquerylimit=512;
  </ServiceException>
</ServiceExceptionReport>`;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(serviceExceptionXml),
    });

    const { rerender } = render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    });

    fakeState = buildState({ histogramBox: fakeHistogramBox });
    rerender(<QueryPanel mapId={mapId} isActive />);

    expect(
      await screen.findByText(
        /Failed to load histogram: Requested data exceeded maxquerylimit=512/,
      ),
    ).toBeInTheDocument();
  });

  it('toggles histogram box-select and renders bins once a box is dragged', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(fakeHistogramResponse)),
    });

    const { rerender } = render(<QueryPanel mapId={mapId} isActive />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    });

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Select area for histogram' }),
      );
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setHistogramBoxSelectActive',
      payload: { mapId, active: true },
    });

    fakeState = buildState({ histogramBox: fakeHistogramBox });
    rerender(<QueryPanel mapId={mapId} isActive />);

    const chart = await waitFor(() => screen.getByTestId('histogram-chart'));
    expect(chart.getAttribute('data-bin-count')).toBe('2');
  });

  it('turns histogram box-select off when the Histogram subtab is left or the panel becomes inactive', () => {
    const { rerender } = render(<QueryPanel mapId={mapId} isActive />);
    mockDispatch.mockClear();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    });
    // Visiting the subtab itself must not turn box-select on by itself -
    // only the explicit button inside it (covered above) does that.
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wmsservices/setHistogramBoxSelectActive',
      }),
    );

    mockDispatch.mockClear();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'GetFeatureInfo' }));
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setHistogramBoxSelectActive',
      payload: { mapId, active: false },
    });

    mockDispatch.mockClear();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    });
    mockDispatch.mockClear();
    rerender(<QueryPanel mapId={mapId} isActive={false} />);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setHistogramBoxSelectActive',
      payload: { mapId, active: false },
    });
  });
});
