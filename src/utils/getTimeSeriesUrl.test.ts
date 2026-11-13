import type { MockedFunction } from 'vitest';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { MapLocation } from '@opengeoweb/webmap-react';
import {
  buildTimeDimensionValue,
  DEFAULT_MAX_TIME_STEPS,
  getTimeDimensionRange,
  getTimeSeriesUrl,
  TimeDimensionLike,
} from './getTimeSeriesUrl';
import { AdagucLayer } from '../store/types';

vi.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: vi.fn(),
  getCorrectWMSDimName: (name: string) => name.toUpperCase(),
}));

vi.mock('ol/source', () => ({
  ImageWMS: vi.fn(function ImageWMSMock() {
    return {
      getFeatureInfoUrl: () => 'http://example.com/wms?LAYERS=air_pressure_msl',
    };
  }),
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
// Fails loudly if no url was built at all.
const requireUrl = (url: string | undefined): string => {
  if (!url) {
    throw new Error('getTimeSeriesUrl returned no url');
  }
  return url;
};

const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;

const layer: AdagucLayer = {
  id: 'layer-1',
  name: 'air_pressure_msl',
  serviceUrl: 'http://example.com/wms?',
  style: 'default',
  dimensions: [],
  enabled: true,
  opacity: 1,
};

const mapPinLocation: MapLocation = {
  lat: 50,
  lon: 5,
  projectionX: 500000,
  projectionY: 6500000,
  resolution: 1000,
  srs: 'EPSG:3857',
};

const makeTimeDimension = (
  values: string[],
): TimeDimensionLike & { name: string; currentValue: string } => ({
  name: 'time',
  currentValue: values[0],
  size: () => values.length,
  getFirstValue: () => values[0],
  getLastValue: () => values[values.length - 1],
  getIndexForValue: (value: string) => {
    const index = values.indexOf(value);
    return index === -1 ? 0 : index;
  },
  getValueForIndex: (index: number) => values[index],
});

describe('buildTimeDimensionValue', () => {
  it('uses the full first/last range when no maxTimeSteps is given', () => {
    const dim = makeTimeDimension(['a', 'b', 'c']);
    expect(buildTimeDimensionValue(dim)).toBe('a/c');
  });

  it('uses the full range when the dimension already fits within maxTimeSteps', () => {
    const dim = makeTimeDimension(['a', 'b', 'c']);
    expect(buildTimeDimensionValue(dim, 20)).toBe('a/c');
  });

  it('windows down to the last maxTimeSteps values, anchored on the end of the range', () => {
    const values = Array.from({ length: 11 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    // 11 values, asking for 6 - keeps the most recent 6 (indices 5..10),
    // still sent as a plain start/end range rather than every one of
    // those 6 spelled out.
    expect(buildTimeDimensionValue(dim, 6)).toBe('t5/t10');
  });

  it('returns a single value (the last) when maxTimeSteps is 1', () => {
    const dim = makeTimeDimension(['t0', 't1', 't2']);
    expect(buildTimeDimensionValue(dim, 1)).toBe('t2');
  });

  it('ignores an invalid (zero or negative) maxTimeSteps and falls back to the full range', () => {
    const dim = makeTimeDimension(['a', 'b', 'c', 'd']);
    expect(buildTimeDimensionValue(dim, 0)).toBe('a/d');
    expect(buildTimeDimensionValue(dim, -5)).toBe('a/d');
  });
});

describe('getTimeDimensionRange', () => {
  it('returns the full first/last range when no maxTimeSteps is given', () => {
    const dim = makeTimeDimension(['a', 'b', 'c']);
    expect(getTimeDimensionRange(dim)).toEqual({ start: 'a', end: 'c' });
  });

  it('windows down to the last maxTimeSteps values, matching buildTimeDimensionValue', () => {
    const values = Array.from({ length: 11 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    expect(getTimeDimensionRange(dim, 6)).toEqual({ start: 't5', end: 't10' });
  });

  it('centers the window on centerValue when given, away from either edge', () => {
    const values = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    // 21 values, asking for 7 around index 10 - lands on indices 7..13.
    expect(getTimeDimensionRange(dim, 7, 't10')).toEqual({
      start: 't7',
      end: 't13',
    });
  });

  it('clamps the centered window at the start of the dimension', () => {
    const values = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    // centerValue near the very start - the window can't shift left past
    // index 0, so it stays anchored there instead.
    expect(getTimeDimensionRange(dim, 7, 't1')).toEqual({
      start: 't0',
      end: 't6',
    });
  });

  it('clamps the centered window at the end of the dimension', () => {
    const values = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    // centerValue near the very end - the window can't shift right past
    // the last index, so it stays anchored there instead.
    expect(getTimeDimensionRange(dim, 7, 't19')).toEqual({
      start: 't14',
      end: 't20',
    });
  });

  it('falls back to index 0 when centerValue is not one of the dimension own values', () => {
    const values = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const dim = makeTimeDimension(values);
    expect(getTimeDimensionRange(dim, 7, 'not-a-real-value')).toEqual({
      start: 't0',
      end: 't6',
    });
  });
});

describe('getTimeSeriesUrl', () => {
  beforeEach(() => {
    mockGetWMLayerById.mockReset();
  });

  it('returns undefined when there is no live WMLayer', () => {
    mockGetWMLayerById.mockReturnValue(undefined);
    expect(getTimeSeriesUrl(layer, mapPinLocation)).toBeUndefined();
  });

  it('passes maxStepsByDimension through to the TIME dimension value', () => {
    const timeDimension = makeTimeDimension(['t0', 't1', 't2', 't3', 't4']);
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // 5 values, asking for 3 - keeps the most recent 3 (indices 2..4) as
    // a plain start/end range. URLSearchParams percent-encodes the '/'.
    const url = getTimeSeriesUrl(layer, mapPinLocation, { time: 3 });
    expect(url).toContain('TIME=t2%2Ft4');
  });

  it('requests the full time range when maxStepsByDimension is not given', () => {
    const timeDimension = makeTimeDimension(['t0', 't1', 't2']);
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getTimeSeriesUrl(layer, mapPinLocation);
    expect(url).toContain('TIME=t0%2Ft2');
  });

  it('caps TIME to DEFAULT_MAX_TIME_STEPS, windowed to the dimension own most recent steps, when no limit is given for it', () => {
    // A dimension bigger than the default cap (e.g. RADAR's full, years-
    // long archive at 5-minute resolution) would otherwise ask the server
    // for every single one of its values in one request - this is what
    // keeps an ordinary (non-retry) request well within a typical
    // server-side maxquerylimit by default, without the caller needing to
    // know anything about this dimension's actual size up front, while
    // still sending a short, plain start/end range rather than spelling
    // out DEFAULT_MAX_TIME_STEPS individual values.
    const values = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const timeDimension = makeTimeDimension(values);
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getTimeSeriesUrl(layer, mapPinLocation);
    const timeParam = new URL(requireUrl(url)).searchParams.get('TIME');
    // 100 values, defaulting to the most recent DEFAULT_MAX_TIME_STEPS.
    expect(timeParam).toBe(`t${values.length - DEFAULT_MAX_TIME_STEPS}/t99`);
  });

  it('lets an explicit maxStepsByDimension.time override the default cap', () => {
    const values = Array.from({ length: 100 }, (_, i) => `t${i}`);
    const timeDimension = makeTimeDimension(values);
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getTimeSeriesUrl(layer, mapPinLocation, { time: 5 });
    const timeParam = new URL(requireUrl(url)).searchParams.get('TIME');
    expect(timeParam).toBe('t95/t99');
  });

  it('sends an explicit timeRangeOverride verbatim, bypassing the default cap', () => {
    // A dimension far bigger than DEFAULT_MAX_TIME_STEPS would normally be
    // windowed down to its own most recent steps - an explicit override
    // (QueryPanel's editable start/end fields) should still win, since the
    // whole point of setting it is to ask for exactly that range.
    const values = Array.from({ length: 1000 }, (_, i) => `t${i}`);
    const timeDimension = makeTimeDimension(values);
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getTimeSeriesUrl(layer, mapPinLocation, undefined, {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-02T00:00:00Z',
    });
    const timeParam = new URL(requireUrl(url)).searchParams.get('TIME');
    expect(timeParam).toBe('2024-01-01T00:00:00Z/2024-01-02T00:00:00Z');
  });

  it('samples a wildcarded series dimension (e.g. member) when it is also given a limit', () => {
    const timeDimension = makeTimeDimension(['t0', 't1', 't2']);
    const memberDimension = {
      name: 'member',
      currentValue: '1',
      size: () => 10,
      getFirstValue: () => '1',
      getLastValue: () => '10',
      getValueForIndex: (index: number) => String(index + 1),
    };
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension, memberDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // 10 members, asking for 4 - evenly spaced indices land on 0,3,6,9.
    const url = getTimeSeriesUrl(layer, mapPinLocation, { member: 4 });
    expect(url).toContain('MEMBER=1%2C4%2C7%2C10');
    // time has no limit given for it, so it keeps its full range.
    expect(url).toContain('TIME=t0%2Ft2');
  });

  it('keeps a wildcarded series dimension as "*" when its limit is not below its size', () => {
    const timeDimension = makeTimeDimension(['t0', 't1', 't2']);
    const memberDimension = {
      name: 'member',
      currentValue: '1',
      size: () => 3,
      getFirstValue: () => '1',
      getLastValue: () => '3',
      getValueForIndex: (index: number) => String(index + 1),
    };
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://example.com/wms?',
      getLayerName: () => 'air_pressure_msl',
      getDimension: (name: string) =>
        name === 'time' ? timeDimension : undefined,
      getDimensions: () => [timeDimension, memberDimension],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getTimeSeriesUrl(layer, mapPinLocation, { member: 10 });
    expect(url).toContain('MEMBER=*');
  });
});
