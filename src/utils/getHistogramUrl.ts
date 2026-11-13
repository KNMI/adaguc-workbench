import { Bbox, getCorrectWMSDimName } from '@opengeoweb/webmap';
import { getWMLayer } from './getWMLayer';
import { AdagucLayer } from '../store/types';
import { makeGoodServiceLink } from './makeGoodServiceLink';

// Ported from adaguc-viewer's gfiapp_histogram.js: a GetHistoGram request is
// the layer's own GetMap request with REQUEST/BBOX swapped - current style
// and dimension values included, same as any other GetMap-family request
// for this layer. WIDTH/HEIGHT only control how many pixels of the bbox
// get sampled into the histogram (more = smoother counts) - the bin edges
// themselves come from the layer's own style/legend scale on the server
// (adaguc-server's CCreateHistogram.cpp), not from these - adaguc-viewer's
// own tool passes the dragged box's actual on-screen pixel size here, so
// this mirrors that instead of a fixed sampling grid.
export const getHistogramUrl = (
  layer: AdagucLayer,
  bbox: Bbox,
  srs: string,
  pixelWidth: number,
  pixelHeight: number,
): string | undefined => {
  const wmLayer = getWMLayer(layer.id);
  if (!wmLayer) {
    return undefined;
  }

  const dimParams = wmLayer
    .getDimensions()
    .map(
      (dimension) =>
        `&${getCorrectWMSDimName(dimension.name)}=${dimension.currentValue}`,
    )
    .join('');

  return (
    `${makeGoodServiceLink(wmLayer.service)}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetHistoGram` +
    `&LAYERS=${encodeURIComponent(wmLayer.getLayerName())}` +
    `&STYLES=${encodeURIComponent(wmLayer.getStyle() ?? '')}` +
    `&CRS=${encodeURIComponent(srs)}` +
    `&BBOX=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}` +
    `&WIDTH=${pixelWidth}&HEIGHT=${pixelHeight}` +
    `&FORMAT=image/png&TRANSPARENT=TRUE${dimParams}`
  );
};
