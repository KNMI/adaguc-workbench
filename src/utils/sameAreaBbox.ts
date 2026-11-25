import { get as getOlProjection, getPointResolution, transform } from 'ol/proj';

interface Bbox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

const LON_LAT = 'EPSG:4326';

interface MapViewLike {
  srs: string;
  bbox: Bbox;
}

// What a map showing `view` should show after switching to another srs to
// keep looking at the same area: the same place in the middle, at the same
// scale there. (Not the old view's corners projected: between two srs's
// those enclose a larger area each time, so switching back and forth would
// zoom the map out step by step. This way, going back gives the view the
// user started with.)
//
// Null when that can't be worked out: no usable view, an srs the viewer has
// no projection for, or a middle the new srs can't show - the far side of
// the globe for EPSG:3035, say.
export const getSameAreaBbox = (
  view: MapViewLike | null | undefined,
  toSrs: string,
): Bbox | null => {
  const from = view ? getOlProjection(view.srs) : null;
  const to = getOlProjection(toSrs);
  if (!view || !from || !to) {
    return null;
  }
  const { left, bottom, right, top } = view.bbox;
  const width = right - left;
  const height = top - bottom;
  if (
    ![left, bottom, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  try {
    const center = [left + width / 2, bottom + height / 2];
    // By way of lon/lat: OpenLayers has no direct transform between its
    // own built-in srs's (CRS:84, EPSG:900913) and the proj4-defined ones,
    // but every srs has one to and from EPSG:4326.
    const newCenter = transform(transform(center, from, LON_LAT), LON_LAT, to);
    // How much ground a thousandth of the view's width covers at its
    // centre, in metres...
    const resolution = width / 1000;
    const groundResolution = getPointResolution(from, resolution, center, 'm');
    // ...and how much of the new srs's units covers that same ground at the
    // new centre. A first guess from the srs's nominal metres per unit
    // gives the local scale to correct it with.
    const guess = groundResolution / (to.getMetersPerUnit() ?? 1);
    const newResolution =
      (guess * groundResolution) /
      getPointResolution(to, guess, newCenter, 'm');
    const scale = newResolution / resolution;
    const bbox = {
      left: newCenter[0] - (width * scale) / 2,
      bottom: newCenter[1] - (height * scale) / 2,
      right: newCenter[0] + (width * scale) / 2,
      top: newCenter[1] + (height * scale) / 2,
    };
    const isUsable =
      Object.values(bbox).every(Number.isFinite) &&
      bbox.right > bbox.left &&
      bbox.top > bbox.bottom;
    return isUsable ? bbox : null;
  } catch {
    // proj4 throws for some coordinates outside a projection's valid area.
    return null;
  }
};
