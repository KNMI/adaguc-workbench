import { AdagucMap } from './types';

const isTimeLinked = (map: AdagucMap, layerId: string): boolean =>
  map.layers
    .find((layer) => layer.id === layerId)
    ?.dimensions.find((dimension) => dimension.name === 'time')?.linked ===
  true;

// Whether a layer is part of the map's running animation: every layer for
// the TIME panel's map-wide Play, otherwise the layer whose Play was
// pressed - plus, if its time slider is linked, every other layer whose
// time slider is linked too (the same group a slider change goes to, see
// changeLayerDimension).
export const isLayerInAnimation = (
  map: AdagucMap,
  layerId: string,
): boolean => {
  if (!map.isAnimating) {
    return false;
  }
  const { animation } = map;
  if (!animation || animation.scope === 'all') {
    return true;
  }
  if (layerId === animation.layerId) {
    return true;
  }
  return isTimeLinked(map, animation.layerId) && isTimeLinked(map, layerId);
};
