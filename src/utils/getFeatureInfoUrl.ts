import { ImageWMS } from 'ol/source';
import { getMapDimURL, getWMLayerById } from '@opengeoweb/webmap';
import { MapLocation } from '@opengeoweb/webmap-react';
import { AdagucLayer } from '../store/types';

export const getFeatureInfoUrl = (
  layer: AdagucLayer,
  mapPinLocation: MapLocation,
): string | undefined => {
  const wmLayer = getWMLayerById(layer.id);
  if (!wmLayer || !mapPinLocation || !wmLayer.getmapURL) {
    return undefined;
  }

  const source = new ImageWMS({
    url: wmLayer.getmapURL,
    params: { LAYERS: wmLayer.getLayerName() },
  });

  const { projectionX, projectionY, resolution } = mapPinLocation;
  if (
    projectionX === undefined ||
    projectionY === undefined ||
    resolution === undefined
  ) {
    return undefined;
  }
  const url = source.getFeatureInfoUrl(
    [projectionX, projectionY],
    resolution,
    mapPinLocation.srs,
    { INFO_FORMAT: 'text/html' },
  );

  if (!url) {
    return undefined;
  }

  return `${url}&${getMapDimURL(wmLayer, layer.dimensions).toString()}`;
};
