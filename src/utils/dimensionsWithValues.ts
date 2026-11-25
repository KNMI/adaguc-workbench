import type { Dimension } from '@opengeoweb/webmap';
import { AdagucLayerDimension } from '../store/types';

// A layer's dimensions for opengeoweb (layer props, request urls), which
// expects every one to have a value - leaving out any that have none (a
// service can advertise a dimension with no values and no default), rather
// than sending them as `undefined`.
export const dimensionsWithValues = (
  dimensions: AdagucLayerDimension[],
): Dimension[] =>
  dimensions.flatMap((dimension) =>
    dimension.currentValue === undefined
      ? []
      : [{ ...dimension, currentValue: dimension.currentValue }],
  );
