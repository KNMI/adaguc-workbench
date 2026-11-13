// Everything this viewer knows about a projection, by srs code: a readable
// name for the Layer settings projection table, and - only for srs's that
// @opengeoweb/webmap-react doesn't already define (its WMProj4Defs: 4326,
// 4269, 3575, 3785, 3857, 3411, 3412, 28992, 5041, 102100, 3067) - the proj4
// definition registerExtraProjections adds, so the map can switch to it.
//
// Mind an srs's axis order when giving it a proj4 definition: under WMS 1.3
// some (like EPSG:4258 and EPSG:32661) are requested north first. Their
// definitions say so with +axis=neu - OpenLayers then swaps the BBOX it
// sends for them, while still keeping its own map coordinates east first
// (proj4 only applies +axis when explicitly asked to, which OpenLayers
// doesn't).
//
// Kept free of imports on purpose, so the table can be used (and tested)
// without loading proj4 or OpenLayers.
interface ProjectionInfo {
  name: string;
  proj4?: string;
}

export const projections: Record<string, ProjectionInfo> = {
  'CRS:84': {
    name: 'WGS 84 -- WGS84 - World Geodetic System 1984, used in GPS',
  },
  'EPSG:25831': {
    name: 'ETRS89 / UTM zone 31N',
    // epsg.io
    proj4:
      '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  },
  'EPSG:25832': {
    name: 'ETRS89 / UTM zone 32N',
    // epsg.io
    proj4:
      '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  },
  'EPSG:28992': {
    name: 'Amersfoort / RD New -- Netherlands - Holland - Dutch',
  },
  'EPSG:3067': { name: 'ETRS89 / TM35FIN(E,N) -- Finland' },
  'EPSG:32661': {
    name: 'WGS 84 / UPS North (N,E)',
    // epsg.io, plus its northing-first axis order.
    proj4:
      '+proj=stere +lat_0=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs +type=crs +axis=neu',
  },
  'EPSG:3411': { name: 'NSIDC Sea Ice Polar Stereographic North' },
  'EPSG:3412': { name: 'NSIDC Sea Ice Polar Stereographic South' },
  'EPSG:3575': { name: 'WGS 84 / North Pole LAEA Europe' },
  'EPSG:3857': {
    name: 'WGS 84 / Pseudo-Mercator -- Spherical Mercator, Google Maps, OpenStreetMap, Bing, ArcGIS, ESRI',
  },
  'EPSG:40000': { name: 'KNMI ECA&D Polar stereographic' },
  'EPSG:4258': {
    name: 'ETRS89',
    // epsg.io, plus its latitude-first axis order.
    proj4:
      '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs +type=crs +axis=neu',
  },
  'EPSG:4326': {
    name: 'WGS 84 -- WGS84 - World Geodetic System 1984, used in GPS',
  },
  'EPSG:50001': { name: '' },
  'EPSG:54030': {
    name: 'Robinson',
    // The standard, widely-used proj4 string for this projection (also
    // used as ESRI:54030 / "World Robinson" by epsg.io and others) - needed
    // by the Robinson preset in utils/predefinedAreas.ts.
    proj4: '+proj=robin +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
  },
  'EPSG:7399': { name: 'WISCRS Vilas County (ftUS)' },
  'EPSG:900913': {
    name: 'Google Maps Global Mercator -- Spherical Mercator (unofficial - used in open source projects / OSGEO)',
  },
};

export const getProjectionName = (srs: string): string | undefined =>
  projections[srs]?.name || undefined;
