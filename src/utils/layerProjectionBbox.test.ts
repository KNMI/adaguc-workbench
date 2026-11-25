import { toMapBbox } from './layerProjectionBbox';
import { registerExtraProjections } from './registerExtraProjections';

// The real OpenLayers projections, as the map uses them.
registerExtraProjections();

// The Dutch radar composite's BoundingBox, as a WMS 1.3 server lists it for
// a north-first srs: northings (or latitudes) where the x's are expected.
const listedNorthFirst = {
  left: 48.895332,
  bottom: 0,
  right: 55.973594,
  top: 10.856413,
};
const eastFirst = {
  left: 0,
  bottom: 48.895332,
  right: 10.856413,
  top: 55.973594,
};

const wms130 = { version: '1.3.0' };
const wms111 = { version: '1.1.1' };

describe('toMapBbox', () => {
  it.each(['EPSG:4258', 'EPSG:3035', 'EPSG:32661'])(
    'puts the bbox of north-first %s east first',
    (srs) => {
      expect(toMapBbox(wms130, srs, listedNorthFirst)).toEqual(eastFirst);
    },
  );

  it.each(['EPSG:3857', 'CRS:84', 'EPSG:28992', 'EPSG:5041'])(
    'leaves the bbox of east-first %s as it is',
    (srs) => {
      expect(toMapBbox(wms130, srs, eastFirst)).toEqual(eastFirst);
    },
  );

  it('leaves EPSG:4326 alone: opengeoweb has already put that one right', () => {
    expect(toMapBbox(wms130, 'EPSG:4326', eastFirst)).toEqual(eastFirst);
  });

  it('leaves a WMS 1.1.1 bbox alone: that version is always east first', () => {
    expect(toMapBbox(wms111, 'EPSG:4258', eastFirst)).toEqual(eastFirst);
  });

  it('leaves the bbox of an srs the viewer does not know as it is', () => {
    expect(toMapBbox(wms130, 'EPSG:9999', eastFirst)).toEqual(eastFirst);
  });

  it('returns plain data, not the bbox object it was given', () => {
    class BboxWithMethods {
      left = 1;

      bottom = 2;

      right = 3;

      top = 4;

      getExtent(): number[] {
        return [this.left, this.bottom, this.right, this.top];
      }
    }

    const result = toMapBbox(wms130, 'EPSG:3857', new BboxWithMethods());

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual({ left: 1, bottom: 2, right: 3, top: 4 });
  });
});
