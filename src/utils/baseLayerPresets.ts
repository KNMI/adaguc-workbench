import { LayerType } from '@opengeoweb/webmap';
import { AdagucBaseLayer } from '../store/types';

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
    service: 'https://geoservices.knmi.nl/wms?DATASET=baselayers&',
    layerType: LayerType.overLayer,
    enabled: true,
  },
];
