import { get as getOlProjection } from 'ol/proj';
import type { WMLayer } from '@opengeoweb/webmap';

interface Bbox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

// Under WMS 1.3 a server lists a layer's BoundingBox in the srs's own axis
// order - north first for one like EPSG:4258, EPSG:3035 or EPSG:32661 (see
// ./projections). opengeoweb puts that right for EPSG:4326 only, so for any
// other north-first srs the bbox on a WMLayer has its x's and y's swapped.
//
// Kept free of @opengeoweb/webmap-react on purpose (its getLayerMapExtent
// counterpart is in ./getLayerMapExtent), so the projection table can use
// this without loading the map components.
export const isBboxListedNorthFirst = (
  wmLayer: Pick<WMLayer, 'version'>,
  srs: string,
): boolean =>
  wmLayer.version === '1.3.0' &&
  srs !== 'EPSG:4326' &&
  (getOlProjection(srs)?.getAxisOrientation().startsWith('ne') ?? false);

// A bbox from wmLayer.projectionProperties, as plain map coordinates: east
// first, whatever the srs's own axis order.
export const toMapBbox = (
  wmLayer: Pick<WMLayer, 'version'>,
  srs: string,
  bbox: Bbox,
): Bbox =>
  isBboxListedNorthFirst(wmLayer, srs)
    ? {
        left: bbox.bottom,
        bottom: bbox.left,
        right: bbox.top,
        top: bbox.right,
      }
    : {
        left: bbox.left,
        bottom: bbox.bottom,
        right: bbox.right,
        top: bbox.top,
      };
