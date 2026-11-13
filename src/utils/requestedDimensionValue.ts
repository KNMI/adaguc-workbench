import { AdagucLayerDimension } from '../store/types';

interface LayerDimensionLike {
  name: string;
  currentValue: string;
  getClosestValue(value: string, evenWhenOutsideRange?: boolean): string;
}

// The value to request for one of a layer's dimensions: the one picked in
// redux (what the layer card shows, and what the map's own GetMap requests
// use), snapped to the closest value the layer actually offers - the same
// rule as opengeoweb's getMapDimURL. Falls back to the WMLayer's own
// current value for a dimension redux doesn't track.
export const requestedDimensionValue = (
  dimension: LayerDimensionLike,
  reduxDimensions: AdagucLayerDimension[],
): string => {
  const picked = reduxDimensions.find(
    (reduxDimension) => reduxDimension.name === dimension.name,
  )?.currentValue;
  return (
    (picked && dimension.getClosestValue(picked, true)) ||
    dimension.currentValue
  );
};
