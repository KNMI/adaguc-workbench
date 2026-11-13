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

  it.each(['EPSG:4258', 'EPSG:32661'])(
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
