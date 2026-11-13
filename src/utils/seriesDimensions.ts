// Dimension names that represent a family of directly-comparable forecasts
// (ensemble members, percentiles of a probabilistic forecast, etc.) rather
// than a single physical axis to pick one value from. getTimeSeriesUrl asks
// the server for every value along a dimension named here (instead of just
// the layer's current one), and parseTimeSeriesResponse turns the resulting
// extra nesting level into one series per value instead of collapsing it
// away like it does for other (singular) dimensions.
export const SERIES_DIMENSION_NAMES = new Set([
  'percentile',
  'member',
  'ensemble',
  'realization',
]);
