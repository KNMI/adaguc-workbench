import { ImageWMS } from 'ol/source';
import { getCorrectWMSDimName } from '@opengeoweb/webmap';
import { getWMLayer } from './getWMLayer';
import { MapLocation } from '@opengeoweb/webmap-react';
import { AdagucLayer } from '../store/types';
import { SERIES_DIMENSION_NAMES } from './seriesDimensions';

// Just the parts of a WMJSDimension that buildTimeDimensionValue actually
// needs, so it stays easy to mock in tests.
export interface TimeDimensionLike {
  size(): number;
  getFirstValue(): string;
  getLastValue(): string;
  // Mirrors buildTimeValueWindow.ts's own TimeWindowDimensionLike - used
  // only by getTimeDimensionRange's centerValue option (QueryPanel's
  // "follow current time" checkbox), to find whereabouts in the
  // dimension's own index space the layer's current time value falls.
  getIndexForValue(value: string, outSideOfRangeFlag?: boolean): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValueForIndex(index: number): any;
}

// Evenly samples at most maxSteps values across a dimension's full range
// of indices (0..size()-1), always including both endpoints.
const sampleDimensionValues = (
  dimension: TimeDimensionLike,
  maxSteps: number,
): string[] => {
  const totalSteps = dimension.size();
  const sampledIndices = new Set<number>();
  for (let i = 0; i < maxSteps; i += 1) {
    const index =
      maxSteps === 1 ? 0 : Math.round((i * (totalSteps - 1)) / (maxSteps - 1));
    sampledIndices.add(index);
  }
  return Array.from(sampledIndices)
    .sort((a, b) => a - b)
    .map((index) => String(dimension.getValueForIndex(index)));
};

// A plain start/end instant pair, as shown/edited in QueryPanel's own
// TimeSeries range fields and sent verbatim as TIME=start/end when given
// to getTimeSeriesUrl as an explicit override.
export interface TimeRange {
  start: string;
  end: string;
}

// A layer's full time range (getFirstValue()..getLastValue()) can span
// anywhere from a handful of steps to a dataset's entire multi-year
// archive at whatever resolution it's stored at (e.g. RADAR's 5-minute
// steps) - requesting that whole range by default would often exceed the
// server's own maxquerylimit outright. Capping the default request to
// this many of the dimension's own most recent steps (see
// buildTimeDimensionValue) keeps an ordinary request well within typical
// server limits without the caller needing to know anything about the
// dimension's actual size up front. A request that still doesn't fit
// (e.g. a large series dimension multiplies the cell count back up)
// falls back to QueryPanel's own reactive maxquerylimit-triggered retry,
// which can shrink this further.
export const DEFAULT_MAX_TIME_STEPS = 64;

// The full first/last range can ask the server for more time steps than
// it's willing to serve in one request (adaguc-server rejects a request
// whose total cell count - time steps times any wildcarded series
// dimension - exceeds its own maxquerylimit). When maxTimeSteps is given
// and the range would exceed it, windows the range down to just maxTimeSteps
// steps instead (still sent as a plain start/end range, rather than
// spelling out every one of those steps explicitly) - this keeps the
// request's own TIME value short regardless of how many steps it covers.
//
// With no centerValue, the window is anchored on the dimension's most
// recent data (its own last value) rather than spreading thin across its
// entire history - this is QueryPanel's ordinary default. With a
// centerValue (QueryPanel's "follow current time" checkbox), the window
// is instead centered on wherever that value falls in the dimension's own
// index space - clamped the same way buildTimeValueWindow.ts's own
// centerWindow clamps near either edge - so the range tracks the layer's
// current time as it's stepped/animated instead of staying fixed at the
// dimension's end.
export const getTimeDimensionRange = (
  timeDimension: TimeDimensionLike,
  maxTimeSteps?: number,
  centerValue?: string,
): TimeRange => {
  const totalSteps = timeDimension.size();
  if (!maxTimeSteps || maxTimeSteps < 1 || totalSteps <= maxTimeSteps) {
    return {
      start: timeDimension.getFirstValue(),
      end: timeDimension.getLastValue(),
    };
  }
  if (centerValue === undefined) {
    return {
      start: String(timeDimension.getValueForIndex(totalSteps - maxTimeSteps)),
      end: timeDimension.getLastValue(),
    };
  }
  const centerIndex = timeDimension.getIndexForValue(centerValue, true);
  const startIndex = Math.max(
    0,
    Math.min(
      centerIndex - Math.floor((maxTimeSteps - 1) / 2),
      totalSteps - maxTimeSteps,
    ),
  );
  const endIndex = startIndex + maxTimeSteps - 1;
  return {
    start: String(timeDimension.getValueForIndex(startIndex)),
    end: String(timeDimension.getValueForIndex(endIndex)),
  };
};

export const buildTimeDimensionValue = (
  timeDimension: TimeDimensionLike,
  maxTimeSteps?: number,
): string => {
  const { start, end } = getTimeDimensionRange(timeDimension, maxTimeSteps);
  return start === end ? start : `${start}/${end}`;
};

/**
 * Builds a GetFeatureInfo request for the full extent of the layer's time
 * dimension (instead of the current time value), returning the server's
 * timeseries data for the given point as JSON. Any ensemble-member/
 * percentile-like dimension (see SERIES_DIMENSION_NAMES) is widened to "*"
 * (every value), so the response includes every one of them in one request.
 *
 * `maxStepsByDimension`, when given, caps how many values are actually
 * requested for the named dimension(s) instead of the usual full time
 * range or "*" wildcard - used to retry a request that failed because it
 * asked for more data than the server's own query limit allows, by
 * shrinking whichever dimensions (time, member, percentile, ...) are
 * needed to fit (see QueryPanel's maxquerylimit handling). TIME is capped
 * by windowing down to that many of the dimension's own most recent steps
 * (see buildTimeDimensionValue), still sent as a plain start/end range;
 * any series dimension (member, percentile, ...) is instead evenly
 * sampled across its own full value set, sent as an explicit
 * comma-separated list. The TIME dimension itself always has some cap
 * applied - DEFAULT_MAX_TIME_STEPS unless the caller overrides it -
 * rather than ever defaulting to the dimension's full, unbounded range.
 *
 * `timeRangeOverride`, when given (QueryPanel's own editable start/end
 * fields), is sent verbatim as TIME=start/end instead - bypassing both
 * the default cap and maxStepsByDimension.time, since the point of
 * setting it explicitly is to ask for exactly that range.
 */
export const getTimeSeriesUrl = (
  layer: AdagucLayer,
  mapPinLocation: MapLocation,
  maxStepsByDimension?: Record<string, number>,
  timeRangeOverride?: TimeRange,
): string | undefined => {
  const wmLayer = getWMLayer(layer.id);
  if (!wmLayer || !mapPinLocation || !wmLayer.getmapURL) {
    return undefined;
  }

  const timeDimension = wmLayer.getDimension('time');
  if (!timeDimension) {
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
    { INFO_FORMAT: 'application/json' },
  );

  if (!url) {
    return undefined;
  }

  const dimParams = new URLSearchParams();
  wmLayer.getDimensions().forEach((dimension) => {
    let value: string;
    const maxSteps =
      maxStepsByDimension?.[dimension.name] ??
      (dimension.name === 'time' ? DEFAULT_MAX_TIME_STEPS : undefined);
    if (dimension.name === 'time') {
      value = timeRangeOverride
        ? `${timeRangeOverride.start}/${timeRangeOverride.end}`
        : buildTimeDimensionValue(dimension, maxSteps);
    } else if (SERIES_DIMENSION_NAMES.has(dimension.name)) {
      // Normally every series value is requested ("*"), but when a
      // retry needs to shrink this dimension too (not just time) to fit
      // under the server's query limit, sample it down instead.
      value =
        maxSteps && maxSteps > 0 && dimension.size() > maxSteps
          ? sampleDimensionValues(dimension, maxSteps).join(',')
          : '*';
    } else {
      value = dimension.currentValue;
    }
    dimParams.append(getCorrectWMSDimName(dimension.name), value);
  });

  return `${url}&${dimParams.toString()}`;
};
