import proj4 from 'proj4';
import { transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import { WMProj4Defs } from '@opengeoweb/webmap';
import { getSameAreaBbox } from './sameAreaBbox';
import { registerExtraProjections } from './registerExtraProjections';

// The real proj4 and OpenLayers, as the map uses them: the projections
// opengeoweb defines itself, and the viewer's own on top.
WMProj4Defs.forEach(([code, definition]) => {
  proj4.defs(code, definition);
});
register(proj4);
registerExtraProjections();

// The Netherlands in the base map's own projection: 3.2-7.3 degrees east,
// 50.7-53.6 north.
const netherlands = {
  srs: 'EPSG:3857',
  bbox: {
    left: 356222,
    bottom: 6571000,
    right: 812632,
    top: 7090000,
  },
};

const centerOf = (bbox: {
  left: number;
  bottom: number;
  right: number;
  top: number;
}): number[] => [(bbox.left + bbox.right) / 2, (bbox.bottom + bbox.top) / 2];

const ALL_SRS = [
  'CRS:84',
  'EPSG:25831',
  'EPSG:25832',
  'EPSG:28992',
  'EPSG:3035',
  'EPSG:3067',
  'EPSG:32661',
  'EPSG:3395',
  'EPSG:3411',
  'EPSG:3412',
  'EPSG:3575',
  'EPSG:3832',
  'EPSG:3857',
  'EPSG:3994',
  'EPSG:40000',
  'EPSG:4258',
  'EPSG:4326',
  'EPSG:50001',
  'EPSG:5041',
  'EPSG:54030',
  'EPSG:7399',
  'EPSG:900913',
];

describe('getSameAreaBbox', () => {
  it('returns the same bbox for the same srs', () => {
    const bbox = getSameAreaBbox(netherlands, 'EPSG:3857');

    expect(bbox?.left).toBeCloseTo(netherlands.bbox.left, 3);
    expect(bbox?.bottom).toBeCloseTo(netherlands.bbox.bottom, 3);
    expect(bbox?.right).toBeCloseTo(netherlands.bbox.right, 3);
    expect(bbox?.top).toBeCloseTo(netherlands.bbox.top, 3);
  });

  it.each(ALL_SRS)('keeps the same place in the middle in %s', (srs) => {
    const bbox = getSameAreaBbox(netherlands, srs);
    if (!bbox) {
      throw new Error(`no bbox for ${srs}`);
    }

    const [lon, lat] = transform(centerOf(bbox), srs, 'EPSG:4326');
    const [expectedLon, expectedLat] = transform(
      centerOf(netherlands.bbox),
      'EPSG:3857',
      'EPSG:4326',
    );
    expect(lon).toBeCloseTo(expectedLon, 6);
    expect(lat).toBeCloseTo(expectedLat, 6);
  });

  it.each(ALL_SRS)(
    'gives back the original view after switching to %s and back',
    (srs) => {
      // Regression guard: projecting the view's corners instead would
      // enclose a larger area on each switch, zooming the map out step by
      // step.
      const there = getSameAreaBbox(netherlands, srs);
      if (!there) {
        throw new Error(`no bbox for ${srs}`);
      }
      const back = getSameAreaBbox({ srs, bbox: there }, 'EPSG:3857');

      // Within a metre, on a view some 450 km wide.
      expect(
        Math.abs((back?.left ?? NaN) - netherlands.bbox.left),
      ).toBeLessThan(1);
      expect(
        Math.abs((back?.bottom ?? NaN) - netherlands.bbox.bottom),
      ).toBeLessThan(1);
      expect(
        Math.abs((back?.right ?? NaN) - netherlands.bbox.right),
      ).toBeLessThan(1);
      expect(Math.abs((back?.top ?? NaN) - netherlands.bbox.top)).toBeLessThan(
        1,
      );
    },
  );

  it('keeps the same place in the middle between any two of them', () => {
    // Regression guard: OpenLayers has no direct transform between its
    // built-in srs's (CRS:84, EPSG:900913) and the proj4-defined ones, so
    // switching from CRS:84 to EPSG:25831 found no area to keep - and the
    // map jumped to the layer's extent instead.
    const [expectedLon, expectedLat] = transform(
      centerOf(netherlands.bbox),
      'EPSG:3857',
      'EPSG:4326',
    );
    ALL_SRS.forEach((fromSrs) => {
      const fromBbox = getSameAreaBbox(netherlands, fromSrs);
      if (!fromBbox) {
        throw new Error(`no bbox for ${fromSrs}`);
      }
      ALL_SRS.forEach((toSrs) => {
        const bbox = getSameAreaBbox({ srs: fromSrs, bbox: fromBbox }, toSrs);
        if (!bbox) {
          throw new Error(`no bbox from ${fromSrs} to ${toSrs}`);
        }
        const [lon, lat] = transform(centerOf(bbox), toSrs, 'EPSG:4326');
        expect(lon, `${fromSrs} to ${toSrs}`).toBeCloseTo(expectedLon, 6);
        expect(lat, `${fromSrs} to ${toSrs}`).toBeCloseTo(expectedLat, 6);
      });
    });
  });

  it('keeps the same scale: the Dutch grid shows the same ground in fewer metres', () => {
    // Web Mercator stretches its metres by 1/cos(latitude) - about 1.63 at
    // the Netherlands' 52 degrees - where the Dutch grid's are true metres.
    const bbox = getSameAreaBbox(netherlands, 'EPSG:28992');
    if (!bbox) {
      throw new Error('no bbox for EPSG:28992');
    }
    const mercatorWidth = netherlands.bbox.right - netherlands.bbox.left;
    const mercatorHeight = netherlands.bbox.top - netherlands.bbox.bottom;

    expect((bbox.right - bbox.left) / mercatorWidth).toBeCloseTo(0.611, 2);
    // The view keeps its shape, so it still fits the map exactly.
    expect((bbox.right - bbox.left) / (bbox.top - bbox.bottom)).toBeCloseTo(
      mercatorWidth / mercatorHeight,
      6,
    );
  });

  it('returns null without a view to keep', () => {
    expect(getSameAreaBbox(undefined, 'EPSG:4326')).toBeNull();
    expect(getSameAreaBbox(null, 'EPSG:4326')).toBeNull();
  });

  it('returns null for an srs the viewer has no projection for', () => {
    expect(getSameAreaBbox(netherlands, 'EPSG:9999')).toBeNull();
    expect(
      getSameAreaBbox(
        { srs: 'EPSG:9999', bbox: netherlands.bbox },
        'EPSG:4326',
      ),
    ).toBeNull();
  });

  it.each([
    ['empty', { left: 5, bottom: 5, right: 5, top: 5 }],
    ['inside out', { left: 5, bottom: 5, right: 1, top: 1 }],
    ['not a number', { left: NaN, bottom: 5, right: 8, top: 8 }],
  ])('returns null for a view that is %s', (_description, bbox) => {
    expect(getSameAreaBbox({ srs: 'EPSG:3857', bbox }, 'EPSG:4326')).toBeNull();
  });

  it('returns null when the new srs cannot show the middle of the view', () => {
    // The far side of the globe from EPSG:3035's centre (10E, 52N), where
    // its projection has no answer.
    const farSide = {
      srs: 'EPSG:4326',
      bbox: { left: -175, bottom: -55, right: -165, top: -49 },
    };

    expect(getSameAreaBbox(farSide, 'EPSG:3035')).toBeNull();
  });
});
