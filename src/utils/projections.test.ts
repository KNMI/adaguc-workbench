import { get as getProjection, transform } from 'ol/proj';
import { getImageSrc, getRequestParams } from 'ol/source/wms';
import { getProjectionName, projections } from './projections';
import { registerExtraProjections } from './registerExtraProjections';

// The real proj4 and OpenLayers, as the map uses them.
registerExtraProjections();

describe('projections', () => {
  it('names a known srs, and nothing for an unknown one', () => {
    expect(getProjectionName('EPSG:25831')).toBe('ETRS89 / UTM zone 31N');
    expect(getProjectionName('EPSG:9999')).toBeUndefined();
  });

  it('makes every srs with a proj4 definition available to OpenLayers', () => {
    Object.entries(projections)
      .filter(([, { proj4 }]) => proj4)
      .forEach(([code]) => {
        expect(getProjection(code)).not.toBeNull();
      });
  });

  it('gives every srs with a proj4 definition a scale the map can draw at', () => {
    // Regression guard: a definition without +units (as adaguc-server has
    // for EPSG:40000) registers fine, but OpenLayers then can't tell the
    // map's scale - and draws nothing at all, without any error.
    Object.entries(projections)
      .filter(([, { proj4 }]) => proj4)
      .forEach(([code]) => {
        const metersPerUnit = getProjection(code)?.getMetersPerUnit();
        expect(
          Number.isFinite(metersPerUnit),
          `${code} has no known units`,
        ).toBe(true);
      });
  });

  // The radar composite of the Netherlands, as adaguc-server lists its
  // BoundingBox for each of these srs's (east first here): its corner at
  // 0°E 55.973594°N has to land on that box's left edge or top.
  it.each([
    ['EPSG:3395', 0, 7517719.443173],
    ['EPSG:3832', -16697923.618991, 7517719.443173],
    ['EPSG:3994', -8413518.511407, 5681886.545472],
    ['EPSG:40000', 0, -3911817.828844],
    ['EPSG:7399', 0, 6483919.221699],
  ])(
    'projects to %s the way adaguc-server does',
    (code, expectedX, expectedY) => {
      const [x, y] = transform([0, 55.973594], 'EPSG:4326', code);
      // Within a metre, on coordinates in the millions.
      expect(Math.abs(x - expectedX)).toBeLessThan(1);
      expect(Math.abs(y - expectedY)).toBeLessThan(1);
    },
  );

  it('limits Mollweide (EPSG:7399) to the area it is valid for', () => {
    // Outside it the inverse returns nonsense - see the extent's comment.
    const [maxX] = transform([180, 0], 'EPSG:4326', 'EPSG:7399');
    const [, maxY] = transform([0, 90], 'EPSG:4326', 'EPSG:7399');
    const extent = getProjection('EPSG:7399')?.getExtent();
    expect(extent?.[0]).toBeCloseTo(-maxX, 3);
    expect(extent?.[1]).toBeCloseTo(-maxY, 3);
    expect(extent?.[2]).toBeCloseTo(maxX, 3);
    expect(extent?.[3]).toBeCloseTo(maxY, 3);
  });

  it.each(['EPSG:4258', 'EPSG:32661', 'EPSG:3035'])(
    'requests %s north first under WMS 1.3, while keeping map coordinates east first',
    (code) => {
      const projection = getProjection(code);
      if (!projection) {
        throw new Error(`${code} is not registered`);
      }
      expect(projection.getAxisOrientation()).toBe('neu');

      // The map itself still works in easting/northing: Amsterdam, given
      // as lon/lat, comes out with its easting first.
      const [x, y] = transform([4.9, 52.37], 'EPSG:4326', code);
      if (code === 'EPSG:4258') {
        expect(x).toBeCloseTo(4.9, 5);
        expect(y).toBeCloseTo(52.37, 5);
      }

      // ...while the GetMap request lists the BBOX north first.
      const src = getImageSrc(
        [x - 1, y - 2, x + 1, y + 2],
        1,
        1,
        projection,
        'https://example.com/wms?',
        getRequestParams({ LAYERS: 'radar' }, 'GetMap'),
        'mapserver',
      );
      const bbox = new URL(src).searchParams
        .get('BBOX')
        ?.split(',')
        .map(Number);
      expect(bbox).toEqual([y - 2, x - 1, y + 2, x + 1]);
    },
  );

  it('keeps an easting-first srs (EPSG:25831) easting first in the request', () => {
    const projection = getProjection('EPSG:25831');
    if (!projection) {
      throw new Error('EPSG:25831 is not registered');
    }
    const src = getImageSrc(
      [1, 2, 3, 4],
      1,
      1,
      projection,
      'https://example.com/wms?',
      getRequestParams({ LAYERS: 'radar' }, 'GetMap'),
      'mapserver',
    );
    expect(new URL(src).searchParams.get('BBOX')).toBe('1,2,3,4');
  });
});
