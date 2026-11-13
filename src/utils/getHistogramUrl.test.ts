import type { MockedFunction } from 'vitest';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { getHistogramUrl } from './getHistogramUrl';
import { AdagucLayer } from '../store/types';

vi.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: vi.fn(),
  getCorrectWMSDimName: (name: string) =>
    name === 'time' || name === 'elevation'
      ? name.toUpperCase()
      : `DIM_${name.toUpperCase()}`,
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;

const layer: AdagucLayer = {
  id: 'layer-1',
  name: 'air_pressure_msl',
  serviceUrl: 'https://geoservices.knmi.nl/adagucserver?dataset=test&',
  style: 'pressure_cwk',
  dimensions: [{ name: 'time', currentValue: '2024-01-01T00:00:00Z' }],
  enabled: true,
  opacity: 1,
};

// A WMLayer dimension whose closest value to anything is that value itself.
const dimension = (name: string, currentValue: string) => ({
  name,
  currentValue,
  getClosestValue: (value: string) => value,
});

const bbox = { left: -600000, bottom: 2100000, right: 7600000, top: 8700000 };

describe('getHistogramUrl', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when the layer has no matching WMLayer instance', () => {
    mockGetWMLayerById.mockReturnValue(undefined);

    expect(getHistogramUrl(layer, bbox, 'EPSG:3857', 190, 959)).toBeUndefined();
  });

  it('builds a GetHistoGram request from the layer own service/style/dimensions, the given bbox, and the dragged box pixel size', () => {
    mockGetWMLayerById.mockReturnValue({
      service: 'https://geoservices.knmi.nl/adagucserver?dataset=test&',
      getLayerName: () => 'air_pressure_msl',
      getStyle: () => 'pressure_cwk',
      getDimensions: () => [
        dimension('time', '2024-01-01T00:00:00Z'),
        dimension('reference_time', '2023-12-31T00:00:00Z'),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getHistogramUrl(layer, bbox, 'EPSG:3857', 190, 959);

    expect(url).toBe(
      'https://geoservices.knmi.nl/adagucserver?dataset=test&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetHistoGram' +
        '&LAYERS=air_pressure_msl&STYLES=pressure_cwk&CRS=EPSG%3A3857' +
        '&BBOX=-600000,2100000,7600000,8700000&WIDTH=190&HEIGHT=959' +
        '&FORMAT=image/png&TRANSPARENT=TRUE' +
        '&TIME=2024-01-01T00:00:00Z&DIM_REFERENCE_TIME=2023-12-31T00:00:00Z',
    );
  });

  it("requests redux's dimension value (what the layer card shows), not the WMLayer's own", () => {
    mockGetWMLayerById.mockReturnValue({
      service: 'https://geoservices.knmi.nl/adagucserver?dataset=test&',
      getLayerName: () => 'air_pressure_msl',
      getStyle: () => 'pressure_cwk',
      // Still on an older time than the one picked in redux.
      getDimensions: () => [dimension('time', '2023-06-01T00:00:00Z')],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const url = getHistogramUrl(layer, bbox, 'EPSG:3857', 190, 959);

    expect(url).toContain('&TIME=2024-01-01T00:00:00Z');
  });
});
