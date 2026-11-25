import type { WMLayer } from '@opengeoweb/webmap';
import { getLayerExtentForProjection } from '@opengeoweb/webmap-react';
import { isBboxListedNorthFirst } from './layerProjectionBbox';

// The layer's extent in the given srs, [minX, minY, maxX, maxY] in map
// coordinates - opengeoweb's getLayerExtentForProjection, with the swapped
// bbox of a north-first srs put right.
export const getLayerMapExtent = (
  wmLayer: WMLayer,
  srs: string,
): number[] | undefined => {
  const extent = getLayerExtentForProjection(wmLayer, srs);
  // Without a BoundingBox for this srs the extent was derived from the
  // layer's lon/lat box instead, and is east first already.
  if (
    !extent ||
    !isBboxListedNorthFirst(wmLayer, srs) ||
    !wmLayer.getCRSByName(srs)
  ) {
    return extent;
  }
  const [minX, minY, maxX, maxY] = extent;
  return [minY, minX, maxY, maxX];
};
