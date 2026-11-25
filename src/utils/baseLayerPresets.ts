import { LayerType } from '@opengeoweb/webmap';
import { AdagucBaseLayer } from '../store/types';

// The `type` of the overlay the viewer draws itself, rather than a server.
export const GRATICULE_LAYER_TYPE = 'graticule';

// KNMI's WMS for overlays: borders, graticules, ...
const BASELAYERS_SERVICE =
  'https://geoservices.knmi.nl/wms?DATASET=baselayers&';

// Ported from adaguc-viewer's config.js `baseLayerConfiguration` list (its
// "Select basemaps and overlays" tab) - same predefined base maps/overlays,
// using the equivalent named tile presets this app's webmap library already
// ships with (see @opengeoweb/webmap's tileServerSettingsList). Fixed,
// descriptive ids rather than generateLayerId(): this is a small, static,
// hand-authored list, not something added/removed at runtime.
export const DEFAULT_BASE_LAYERS: AdagucBaseLayer[] = [
  {
    id: 'baselayer-naturalearth2',
    name: 'NaturalEarth2',
    title: 'World base layer Natural Earth',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'baselayer-worldmap',
    name: 'WorldMap',
    title: 'KNMI Basemap',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    // https://geoweb-maps-assets.pmc.knmi.cloud/WorldMap_Light_Grey_Canvas/
    // EPSG3857/{z}/{x}/{y}.png - EPSG:3857 only.
    id: 'baselayer-worldmap-light-grey-canvas',
    name: 'WorldMap_Light_Grey_Canvas',
    title: 'KNMI Basemap Light Grey Canvas',
    type: 'twms',
    layerType: LayerType.baseLayer,
    // The default base map.
    enabled: true,
  },
  {
    id: 'baselayer-arcgis-canvas',
    name: 'arcGisCanvas',
    title: 'ESRI ArcGIS Canvas',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'baselayer-arcgis-satellite',
    name: 'arcGisSat',
    title: 'ESRI ArcGIS Satellite',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'baselayer-arcgis-topography',
    name: 'arcGisTopo',
    title: 'ESRI ArcGIS Topography',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'baselayer-arcgis-ocean',
    name: 'arcGisOceanBaseMap',
    title: 'ESRI ArcGIS Ocean',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'baselayer-openstreetmap',
    name: 'OpenStreetMap_Service',
    title: 'OpenStreetMap',
    type: 'twms',
    layerType: LayerType.baseLayer,
    enabled: false,
  },
  {
    id: 'overlay-countryborders',
    name: 'countryborders',
    title: 'World country borders',
    format: 'image/png',
    service: BASELAYERS_SERVICE,
    layerType: LayerType.overLayer,
    enabled: true,
  },
  // The same borders in the other outline styles that service offers - a
  // white or black outline stays visible over dark or light data.
  {
    id: 'overlay-countryborders-white',
    name: 'countryborders',
    title: 'World country borders (white)',
    style: 'white-2px/polyline',
    format: 'image/png',
    service: BASELAYERS_SERVICE,
    layerType: LayerType.overLayer,
    enabled: false,
  },
  {
    id: 'overlay-countryborders-black',
    name: 'countryborders',
    title: 'World country borders (black)',
    style: 'black-2px/polyline',
    format: 'image/png',
    service: BASELAYERS_SERVICE,
    layerType: LayerType.overLayer,
    enabled: false,
  },
  {
    id: 'overlay-countryborders-blue',
    name: 'countryborders',
    title: 'World country borders (blue)',
    style: 'blue-2px/polyline',
    format: 'image/png',
    service: BASELAYERS_SERVICE,
    layerType: LayerType.overLayer,
    enabled: false,
  },
  {
    id: 'overlay-graticules10',
    name: 'graticules10',
    title: 'Latitude/longitude lines (every 10°)',
    format: 'image/png',
    service: BASELAYERS_SERVICE,
    layerType: LayerType.overLayer,
    enabled: false,
  },
  // Not an image from a server like the other overlays: drawn in the
  // browser (see OpenLayersGraticule), so its lines can follow the view.
  {
    id: 'overlay-graticule',
    name: 'graticule',
    title: 'Latitude/longitude lines (follow the zoom level)',
    type: GRATICULE_LAYER_TYPE,
    layerType: LayerType.overLayer,
    enabled: false,
  },
];
