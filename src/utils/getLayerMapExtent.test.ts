import type { WMLayer } from '@opengeoweb/webmap';
import { getLayerExtentForProjection } from '@opengeoweb/webmap-react';
import { getLayerMapExtent } from './getLayerMapExtent';
import { registerExtraProjections } from './registerExtraProjections';

vi.mock('@opengeoweb/webmap-react', () => ({
  getLayerExtentForProjection: vi.fn(),
}));

const mockGetLayerExtentForProjection = vi.mocked(getLayerExtentForProjection);

// The real OpenLayers projections, as the map uses them.
registerExtraProjections();

describe('getLayerMapExtent', () => {
  const layer = (version: string, listedSrs: string[]): WMLayer =>
    ({
      version,
      getCRSByName: (srs: string) =>
        listedSrs.includes(srs) ? { srs } : undefined,
    }) as unknown as WMLayer;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('puts the extent of a north-first srs east first', () => {
    mockGetLayerExtentForProjection.mockReturnValue([48.9, 0, 56, 10.9]);

    expect(
      getLayerMapExtent(layer('1.3.0', ['EPSG:4258']), 'EPSG:4258'),
    ).toEqual([0, 48.9, 10.9, 56]);
  });

  it('leaves the extent of an east-first srs as it is', () => {
    mockGetLayerExtentForProjection.mockReturnValue([1, 2, 3, 4]);

    expect(
      getLayerMapExtent(layer('1.3.0', ['EPSG:3857']), 'EPSG:3857'),
    ).toEqual([1, 2, 3, 4]);
  });

  it('leaves an extent derived from the lon/lat box as it is', () => {
    // The layer lists no BoundingBox for this srs, so opengeoweb projected
    // the layer's geographic bounding box instead - east first already.
    mockGetLayerExtentForProjection.mockReturnValue([0, 48.9, 10.9, 56]);

    expect(getLayerMapExtent(layer('1.3.0', []), 'EPSG:4258')).toEqual([
      0, 48.9, 10.9, 56,
    ]);
  });

  it('returns nothing for a layer without an extent', () => {
    mockGetLayerExtentForProjection.mockReturnValue(undefined);

    expect(
      getLayerMapExtent(layer('1.3.0', ['EPSG:4258']), 'EPSG:4258'),
    ).toBeUndefined();
  });
});
