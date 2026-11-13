import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';

// @opengeoweb/webmap-react registers a fixed set of proj4 definitions on
// import (its own WMProj4Defs list: 4326, 4269, 3575, 3785, 3857, 3411,
// 3412, 28992, 5041, 102100, 3067). OpenLayers can't build a View for any
// other srs - `ol/proj`.get(srs) returns null for it, and View construction
// then throws "Cannot read properties of null (reading 'getExtent')". That
// list misses some srs's this viewer offers: one used by
// utils/predefinedAreas.ts, and ones commonly advertised in a layer's
// GetCapabilities (and so listed in its Layer settings projection table).
// Register those here so they can actually be switched to.
const ADDITIONAL_PROJ4_DEFS: [string, string][] = [
  // Robinson - the standard, widely-used proj4 string for this projection
  // (also used as ESRI:54030 / "World Robinson" by epsg.io and others).
  [
    'EPSG:54030',
    '+proj=robin +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
  ],
  // ETRS89 / UTM zones 31N and 32N (epsg.io) - both easting/northing axis
  // order, so they need no WMS 1.3 axis-order special-casing.
  [
    'EPSG:25831',
    '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  ],
  [
    'EPSG:25832',
    '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  ],
];

let registered = false;

// eslint-disable-next-line import/prefer-default-export
export const registerExtraProjections = (): void => {
  if (registered) {
    return;
  }
  registered = true;
  ADDITIONAL_PROJ4_DEFS.forEach(([code, definition]) => {
    proj4.defs(code, definition);
  });
  register(proj4);
};
