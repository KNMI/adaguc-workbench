import * as React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Checkbox, FormControlLabel, TextField } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { UseQueryResult, useQueries } from '@tanstack/react-query';
import { MapLocation } from '@opengeoweb/webmap-react';
import { actions, useAppDispatch, useAppSelector } from '../../../store/store';
import { selectors } from '../../../store/selectors';
import { AdagucLayer, ViewerState } from '../../../store/types';
import { getWMLayer } from '../../../utils/getWMLayer';
import { extractServiceErrorMessage } from '../../../utils/extractServiceErrorMessage';
import {
  DEFAULT_MAX_TIME_STEPS,
  getTimeDimensionRange,
  getTimeSeriesUrl,
  TimeRange,
} from '../../../utils/getTimeSeriesUrl';
import {
  parseTimeSeriesResponse,
  TimeSeriesResult,
} from '../../../utils/parseTimeSeriesResponse';
import { SERIES_DIMENSION_NAMES } from '../../../utils/seriesDimensions';
import { useDebouncedValue } from '../../../utils/useDebouncedValue';
import {
  QueryLayerItem,
  RequestLink,
  SubPanelProps,
  fetchText,
  formatTimeTick,
  parseServiceResponse,
  queryPanelQueryOptions,
  reportUnexpectedErrors,
  safeUrl,
} from './queryShared';

// Identifies one series' legend entry within one layer's chart (each layer
// renders its own chart/legend, so the dataKey alone isn't enough).
interface SeriesKey {
  layerId: string;
  dataKey: string;
}

// Fixed, in-order categorical palette for the series lines, so a given
// position always gets the same color regardless of how many series there
// are (cycling only once there are more series than colors).
const SERIES_COLORS = [
  '#1976d2',
  '#d84315',
  '#2e7d32',
  '#6a1b9a',
  '#00838f',
  '#ef6c00',
  '#5d4037',
  '#616161',
];

const getSeriesDataKey = (seriesName: string): string => seriesName || 'value';

interface SeriesLegendItem {
  dataKey: string;
  name: string;
  color: string;
}

interface SeriesLegendProps {
  items: SeriesLegendItem[];
  // The hovered-or-pinned series' dataKeys, if any (shared with the Lines
  // themselves, which dim every series but these the same way). Hovering
  // one shows just that one (overriding any pinned set below); with
  // nothing hovered, any number of series can be pinned at once.
  activeDataKeys: ReadonlySet<string> | null;
  onHoverSeries: (dataKey: string) => void;
  onUnhoverSeries: () => void;
  onTogglePinSeries: (dataKey: string) => void;
}

// A custom legend (used in place of recharts' default one via Legend's
// `content` prop) so the active series' entries can be highlighted - bold,
// full opacity - while the rest are dimmed, matching the chart's lines.
// Defined at module scope (rather than inline where it's used) so it
// doesn't change identity on every render, and extra props recharts
// clones onto it (payload, iconSize, ...) land on this component rather
// than on a raw DOM element, where they'd otherwise log warnings.
const SeriesLegend = ({
  items,
  activeDataKeys,
  onHoverSeries,
  onUnhoverSeries,
  onTogglePinSeries,
}: SeriesLegendProps): React.ReactElement => (
  <ul
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
      margin: '4px 0 0',
      padding: 0,
      listStyle: 'none',
    }}
  >
    {items.map(({ dataKey, name, color }) => {
      const isHighlighted = activeDataKeys?.has(dataKey) ?? false;
      const isDimmed = activeDataKeys !== null && !isHighlighted;
      return (
        <li key={dataKey}>
          <button
            type="button"
            onMouseEnter={() => onHoverSeries(dataKey)}
            onMouseLeave={onUnhoverSeries}
            onClick={() => onTogglePinSeries(dataKey)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: isHighlighted ? 700 : 400,
              opacity: isDimmed ? 0.4 : 1,
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: color,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            {name}
          </button>
        </li>
      );
    })}
  </ul>
);

// recharts draws one Line per series, so the chart's shared `data` is a
// single array with one row per time, each series' value under its own key.
const buildTimeSeriesChartData = (
  result: TimeSeriesResult,
): Array<Record<string, number | string>> => {
  const rowByTime = new Map<string, Record<string, number | string>>();
  result.series.forEach((series) => {
    const dataKey = getSeriesDataKey(series.seriesName);
    series.points.forEach((point) => {
      const row = rowByTime.get(point.time) ?? { time: point.time };
      row[dataKey] = point.value;
      rowByTime.set(point.time, row);
    });
  });
  return Array.from(rowByTime.values()).sort((a, b) =>
    String(a.time).localeCompare(String(b.time)),
  );
};

const MAX_QUERY_LIMIT_PATTERN = /maxquerylimit=(\d+)/i;

// Several things can change the timeseries request in quick succession -
// clicking a new map point, editing the Start/End fields keystroke by
// keystroke, and especially "Follow current time", which can change it on
// every single animation/step tick. Debouncing the requests themselves
// covers all of these the same way: only the last of a rapid burst of
// changes actually reaches the server. Until then, the previous chart
// stays as it is, rather than flashing "Loading…" for a change that's
// about to be superseded anyway.
const TIMESERIES_FETCH_DEBOUNCE_MS = 400;

// adaguc-server's own maxquerylimit caps the *total* number of cells a
// request can return - for a timeseries request that's time steps
// multiplied by every wildcarded series dimension (member, percentile,
// ...), not time steps alone. Rather than only shrinking time (which
// can't help a layer that already has few time steps but many members),
// this scales every variable dimension down by the same factor, so each
// one keeps a proportional share of its original resolution.
const computeDimensionLimits = (
  layer: AdagucLayer,
  queryLimit: number,
): Record<string, number> | undefined => {
  const wmLayer = getWMLayer(layer.id);
  if (!wmLayer) {
    return undefined;
  }
  const timeDimension = wmLayer.getDimension('time');
  const variableDimensions = wmLayer
    .getDimensions()
    .filter(
      (dimension) =>
        dimension.name === 'time' || SERIES_DIMENSION_NAMES.has(dimension.name),
    )
    .map((dimension) => ({
      name: dimension.name,
      size: Math.max(1, dimension.size()),
    }));
  if (!timeDimension || variableDimensions.length === 0) {
    return undefined;
  }
  const totalCells = variableDimensions.reduce(
    (product, dimension) => product * dimension.size,
    1,
  );
  if (totalCells <= queryLimit) {
    return undefined;
  }
  const scale = (queryLimit / totalCells) ** (1 / variableDimensions.length);
  const limits: Record<string, number> = {};
  variableDimensions.forEach((dimension) => {
    limits[dimension.name] = Math.max(1, Math.floor(dimension.size * scale));
  });
  return limits;
};

// Fetches a layer's timeseries, retrying once with every variable
// dimension (time plus any wildcarded series dimension - see
// getTimeSeriesUrl) scaled down together when the server rejects the full
// request for exceeding its own maxquerylimit, rather than that just being
// a dead end. A second failure is reported as is.
const fetchTimeSeries = (
  url: string,
  layer: AdagucLayer,
  mapPinLocation: MapLocation | undefined,
  timeRangeOverride: TimeRange | undefined,
): Promise<TimeSeriesResult> =>
  reportUnexpectedErrors(async () => {
    const response = await fetchText(url);
    if (!response.ok) {
      const message = extractServiceErrorMessage(response.text);
      const limitMatch = MAX_QUERY_LIMIT_PATTERN.exec(message);
      const retryLimits = limitMatch
        ? computeDimensionLimits(layer, Number(limitMatch[1]))
        : undefined;
      const retryUrl =
        retryLimits && mapPinLocation
          ? getTimeSeriesUrl(
              layer,
              mapPinLocation,
              retryLimits,
              timeRangeOverride,
            )
          : undefined;
      if (retryUrl) {
        return parseServiceResponse(
          await fetchText(retryUrl),
          parseTimeSeriesResponse,
        );
      }
    }
    return parseServiceResponse(response, parseTimeSeriesResponse);
  });

const TimeSeriesPanel = ({
  mapId,
  isShown,
}: SubPanelProps): React.ReactElement | null => {
  const dispatch = useAppDispatch();
  const theme = useTheme();

  // Which series' legend entry is currently hovered (per layer, since each
  // one renders its own chart/legend) - the rest of that chart's lines are
  // dimmed below while this is set, so the hovered one stands out. This
  // always wins over any pinned selection below, but only while it lasts.
  const [hoveredSeries, setHoveredSeries] = React.useState<SeriesKey | null>(
    null,
  );
  // Series "pinned" by clicking their legend entry rather than just
  // hovering them - any number can be pinned per chart at once, and each
  // stays highlighted once the mouse moves away, until its own entry is
  // clicked again to un-pin it. Keyed by the chart's own request url, so a
  // pin never carries over to a new request - a series from a previous
  // dataset (e.g. a member number) may not exist in the new one.
  const [pinnedSeriesByRequest, setPinnedSeriesByRequest] = React.useState<
    Record<string, ReadonlySet<string>>
  >({});
  // The user's own explicit start/end for the request, set via the two
  // editable fields below - undefined means "automatic" (each layer's own
  // default range, windowed to DEFAULT_MAX_TIME_STEPS - see
  // getTimeSeriesUrl). Shared across every enabled layer's chart, same as
  // mapPinLocation is, rather than tracked per layer.
  const [timeRangeOverride, setTimeRangeOverride] = React.useState<
    TimeRange | undefined
  >(undefined);
  // When checked (the "Follow current time" checkbox below), the request
  // range is instead recomputed every render, centered on the reference
  // layer's own current time value - tracking it as it's stepped or
  // animated - overriding any manual timeRangeOverride while it's on.
  // Unchecking it again freezes the fields at wherever that tracked range
  // last landed, by writing it into timeRangeOverride at that point (see
  // the checkbox's own onChange) - rather than reverting to whatever
  // timeRangeOverride held from before following was turned on.
  const [followCurrentTime, setFollowCurrentTime] = React.useState(false);
  // Local text for the two range fields, so typing a partial/invalid date
  // doesn't immediately refetch or get clobbered by a re-render - only
  // committed (onBlur/Enter) into timeRangeOverride once both parse.
  const [startText, setStartText] = React.useState('');
  const [endText, setEndText] = React.useState('');
  // Used (via onBlur's relatedTarget) to tell "moved from Start to End" or
  // vice versa apart from "left both fields" - see handleRangeFieldBlur.
  const startFieldRef = React.useRef<HTMLInputElement>(null);
  const endFieldRef = React.useRef<HTMLInputElement>(null);

  const layers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const mapPinLocation = useAppSelector(
    (state: ViewerState): MapLocation | undefined =>
      state?.viewer?.maps[mapId]?.mapPinLocation,
  );
  const enabledLayers = layers.filter((layer) => layer.enabled);

  // The range shown in the two editable fields below before the user has
  // set their own override - the first enabled, time-aware layer's own
  // default range (see getTimeSeriesUrl), so the fields start out matching
  // whatever would actually be requested automatically. Deliberately not
  // memoized on anything derived from redux: getWMLayer reads a live
  // registry the webmap library populates asynchronously, outside
  // React/redux entirely, so a layer can already be enabled in redux
  // before its own live WMLayer (and dimension) exists - memoizing on a
  // redux-derived key could permanently cache that not-ready-yet
  // "undefined" from an early render, with nothing left to ever invalidate
  // it once the registry actually catches up. It's just a couple of
  // lookups, cheap enough to not need memoizing.
  const referenceLayer = enabledLayers.find(
    (layer) => !!getWMLayer(layer.id)?.getDimension('time'),
  );
  const defaultTimeDimension = referenceLayer
    ? getWMLayer(referenceLayer.id)?.getDimension('time')
    : undefined;
  const defaultTimeRange: TimeRange | undefined = defaultTimeDimension
    ? getTimeDimensionRange(defaultTimeDimension, DEFAULT_MAX_TIME_STEPS)
    : undefined;

  // The reference layer's own redux-tracked current time value - read from
  // the same layer defaultTimeDimension came from, so "follow" tracks
  // whichever layer the default range itself is based on.
  const referenceLayerCurrentValue = referenceLayer?.dimensions.find(
    (dimension) => dimension.name === 'time',
  )?.currentValue;
  // Recomputed fresh every render (same reasoning as defaultTimeRange
  // above) so this tracks the current value immediately as it's stepped
  // or animated, without needing its own effect/subscription.
  const followedTimeRange: TimeRange | undefined =
    followCurrentTime && defaultTimeDimension && referenceLayerCurrentValue
      ? getTimeDimensionRange(
          defaultTimeDimension,
          DEFAULT_MAX_TIME_STEPS,
          referenceLayerCurrentValue,
        )
      : undefined;
  // What's actually sent as the TIME override to every enabled layer's
  // request - following wins over timeRangeOverride while it's checked
  // (see followCurrentTime above for what happens once it's unchecked).
  const activeTimeRangeOverride = followCurrentTime
    ? followedTimeRange
    : timeRangeOverride;

  const effectiveTimeRange = activeTimeRangeOverride ?? defaultTimeRange;
  // A plain string, rather than effectiveTimeRange itself, drives the sync
  // effect below - effectiveTimeRange is a new object every render (see
  // above), which would otherwise re-fire that effect, and so reset
  // startText/endText, on every render including ones caused by typing in
  // the fields themselves.
  const effectiveTimeRangeKey = effectiveTimeRange
    ? `${effectiveTimeRange.start}/${effectiveTimeRange.end}`
    : '';

  // Keeps the two fields' displayed text in sync with whichever range is
  // actually in effect, whenever that changes from outside the fields
  // themselves (e.g. defaultTimeRange resolving once the registry becomes
  // ready, or shifting because the set of enabled layers changed) - but
  // not while the user is actively typing in them, since
  // effectiveTimeRangeKey only changes via timeRangeOverride once a typed
  // value is already committed.
  const resetTimeRangeFields = React.useEffectEvent(() => {
    setStartText(effectiveTimeRange?.start ?? '');
    setEndText(effectiveTimeRange?.end ?? '');
  });
  React.useEffect(() => {
    resetTimeRangeFields();
  }, [effectiveTimeRangeKey]);

  // Each layer's request as it stands right now (also what the caption
  // links to), and - debounced, see TIMESERIES_FETCH_DEBOUNCE_MS - the one
  // actually fetched. A url only changes when the request itself does:
  // getTimeSeriesUrl asks for the layer's time *range* and every series
  // value, so stepping the time slider leaves it alone (unless following).
  const urlByLayerId: Record<string, string | undefined> = {};
  enabledLayers.forEach((layer) => {
    urlByLayerId[layer.id] = mapPinLocation
      ? safeUrl(() =>
          getTimeSeriesUrl(
            layer,
            mapPinLocation,
            undefined,
            activeTimeRangeOverride,
          ),
        )
      : undefined;
  });
  const debouncedUrlByLayerId = JSON.parse(
    useDebouncedValue(
      JSON.stringify(urlByLayerId),
      TIMESERIES_FETCH_DEBOUNCE_MS,
    ),
  ) as Record<string, string | undefined>;

  const results = useQueries({
    queries: enabledLayers.map((layer) => {
      const url = debouncedUrlByLayerId[layer.id];
      return {
        queryKey: ['query-panel', 'timeSeries', url],
        queryFn: () =>
          fetchTimeSeries(
            url ?? '',
            layer,
            mapPinLocation,
            activeTimeRangeOverride,
          ),
        enabled: !!url,
        ...queryPanelQueryOptions,
      };
    }),
  });

  if (!isShown) {
    return null;
  }

  const jumpLayerToTime = (layer: AdagucLayer, time: string): void => {
    const layerIndex = layers.findIndex((l) => l.id === layer.id);
    if (layerIndex === -1) {
      return;
    }
    // Snap to the dimension's own value representation (as getMapDimURL
    // does for dimension overrides elsewhere), so this matches exactly
    // what the time slider would set and the slider picks up the change.
    const timeDimension = getWMLayer(layer.id)?.getDimension('time');
    const dimensionValue = timeDimension
      ? timeDimension.getClosestValue(time, true)
      : time;
    dispatch(
      actions.changeLayerDimension({
        mapId,
        layerIndex,
        dimensionName: 'time',
        dimensionValue,
      }),
    );
  };

  // Commits the two range fields' current text into timeRangeOverride,
  // once both parse as dates - called on blur/Enter rather than on every
  // keystroke, so a partial/invalid in-progress edit doesn't immediately
  // refetch or get clobbered by the sync effect above. An invalid commit
  // (either field doesn't parse) reverts both fields back to whatever
  // range is actually in effect instead of sending a bad TIME value.
  const commitTimeRange = (): void => {
    const start = startText.trim();
    const end = endText.trim();
    if (
      !start ||
      !end ||
      Number.isNaN(Date.parse(start)) ||
      Number.isNaN(Date.parse(end))
    ) {
      setStartText(effectiveTimeRange?.start ?? '');
      setEndText(effectiveTimeRange?.end ?? '');
      return;
    }
    setTimeRangeOverride({ start, end });
  };

  // Committing on every single blur would fire too early when tabbing (or
  // clicking) from Start straight to End: Start's blur would commit using
  // End's still-stale, not-yet-edited text, and the resulting override
  // change would re-trigger the sync effect above, which would then
  // immediately overwrite whatever the user had already typed into End
  // but not yet committed. Only actually committing once focus leaves
  // both fields (not just moves between them) avoids both problems -
  // event.relatedTarget identifies where focus is going before this
  // field's own onChange-driven state updates finish propagating.
  const handleRangeFieldBlur = (
    event: React.FocusEvent<HTMLInputElement>,
  ): void => {
    const nextFocusTarget = event.relatedTarget;
    if (
      nextFocusTarget === startFieldRef.current ||
      nextFocusTarget === endFieldRef.current
    ) {
      return;
    }
    commitTimeRange();
  };

  const renderBody = (
    layer: AdagucLayer,
    query: UseQueryResult<TimeSeriesResult>,
  ): React.ReactNode => {
    if (!mapPinLocation) {
      return 'Click on the map to select a point';
    }
    if (!urlByLayerId[layer.id]) {
      return 'No time dimension for this layer';
    }
    if (query.isError) {
      return query.error.message ? (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          Failed to load timeseries: {query.error.message}
        </span>
      ) : (
        'Failed to load timeseries'
      );
    }
    if (!query.data) {
      return 'Loading…';
    }
    const result = query.data;
    if (result.series.every((s) => s.points.length === 0)) {
      return 'No data for this point';
    }

    const chartData = buildTimeSeriesChartData(result);
    const hasMultipleSeries = result.series.length > 1;
    // Each series' color/display name/dataKey, computed once and shared
    // between the Line and legend below instead of recomputed in both.
    const seriesRenderInfo = result.series.map((series, index) => ({
      series,
      dataKey: getSeriesDataKey(series.seriesName),
      name: hasMultipleSeries
        ? `${result.seriesDimensionName} ${series.seriesName}`
        : (result.standardName ?? layer.name),
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
    // Tooltip defaults to sorting entries by their string name, which
    // orders "10" before "100" before "25". Sort by the same (already
    // numeric-aware) order the series themselves are in.
    const seriesOrderByDataKey = new Map(
      seriesRenderInfo.map(({ dataKey }, index) => [dataKey, index]),
    );
    // Every Line here is given a string dataKey (see getSeriesDataKey).
    const itemSorter = (item: { dataKey?: unknown }): number =>
      typeof item.dataKey === 'string'
        ? (seriesOrderByDataKey.get(item.dataKey) ?? 0)
        : 0;

    // Hovering previews a single series without losing whatever's pinned
    // - it takes over again once the mouse moves away. With nothing
    // hovered, any number of pinned series are all shown active at once.
    const requestKey = `${layer.id}|${debouncedUrlByLayerId[layer.id]}`;
    const pinnedSeries = pinnedSeriesByRequest[requestKey];
    let activeDataKeys: ReadonlySet<string> | null = null;
    if (hoveredSeries?.layerId === layer.id) {
      activeDataKeys = new Set([hoveredSeries.dataKey]);
    } else if (pinnedSeries && pinnedSeries.size > 0) {
      activeDataKeys = pinnedSeries;
    }

    const toggleSeriesPin = (dataKey: string): void => {
      setPinnedSeriesByRequest((previous) => {
        const current = new Set(previous[requestKey]);
        // Clicking an already-pinned entry un-pins just that one, rather
        // than only ever adding more pins.
        if (current.has(dataKey)) {
          current.delete(dataKey);
        } else {
          current.add(dataKey);
        }
        return { ...previous, [requestKey]: current };
      });
    };

    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={chartData}
          style={{ cursor: 'pointer' }}
          onClick={(chartState) => {
            if (typeof chartState?.activeLabel === 'string') {
              jumpLayerToTime(layer, chartState.activeLabel);
            }
          }}
        >
          <CartesianGrid
            stroke={theme.palette.divider}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tickFormatter={formatTimeTick}
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            minTickGap={20}
          />
          <YAxis
            domain={['auto', 'auto']}
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            width={55}
            label={
              result.units
                ? {
                    value: result.units,
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 11,
                    fill: theme.palette.text.secondary,
                  }
                : undefined
            }
          />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === 'string' ? formatTimeTick(label) : label
            }
            formatter={(value, name) => [
              typeof value === 'number'
                ? `${value} ${result.units ?? ''}`.trim()
                : value,
              name,
            ]}
            itemSorter={itemSorter}
          />
          {hasMultipleSeries && (
            <Legend
              itemSorter={itemSorter}
              content={
                <SeriesLegend
                  items={seriesRenderInfo}
                  activeDataKeys={activeDataKeys}
                  onHoverSeries={(dataKey) =>
                    setHoveredSeries({ layerId: layer.id, dataKey })
                  }
                  onUnhoverSeries={() => setHoveredSeries(null)}
                  onTogglePinSeries={toggleSeriesPin}
                />
              }
            />
          )}
          {seriesRenderInfo.map(({ series, dataKey, name, color }) => {
            // Dim every series other than the active (hovered or pinned)
            // ones, so those stand out against the rest.
            const isDimmed =
              activeDataKeys !== null && !activeDataKeys.has(dataKey);
            const opacity = isDimmed ? 0.15 : 1;
            return (
              <Line
                key={series.seriesName}
                type="linear"
                dataKey={dataKey}
                name={name}
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={2}
                dot={{
                  r: 3,
                  fill: color,
                  strokeWidth: 0,
                  fillOpacity: opacity,
                }}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <>
      <div className="query_panel_header" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <TextField
            label="Start"
            size="small"
            disabled={followCurrentTime}
            inputRef={startFieldRef}
            value={startText}
            onChange={(event) => setStartText(event.target.value)}
            onBlur={handleRangeFieldBlur}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTimeRange();
              }
            }}
            sx={{ width: 190, bgcolor: 'background.paper' }}
          />
          <TextField
            label="End"
            size="small"
            disabled={followCurrentTime}
            inputRef={endFieldRef}
            value={endText}
            onChange={(event) => setEndText(event.target.value)}
            onBlur={handleRangeFieldBlur}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTimeRange();
              }
            }}
            sx={{ width: 190, bgcolor: 'background.paper' }}
          />
          {!followCurrentTime && timeRangeOverride && (
            <Button
              size="small"
              variant="text"
              onClick={() => setTimeRangeOverride(undefined)}
            >
              Auto
            </Button>
          )}
        </div>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={followCurrentTime}
              onChange={(event) => {
                const { checked } = event.target;
                if (!checked && followedTimeRange) {
                  // Freezes the fields at wherever following last had
                  // them, rather than snapping back to an older manual
                  // override (or the automatic default) set before
                  // following was turned on.
                  setTimeRangeOverride(followedTimeRange);
                }
                setFollowCurrentTime(checked);
              }}
            />
          }
          label="Follow current time"
        />
      </div>
      {enabledLayers.map((layer, index) => {
        const query = results[index];
        return (
          <QueryLayerItem
            key={layer.id}
            layer={layer}
            subTab="TimeSeries"
            caption={
              <>
                {query.data?.units && <span>({query.data.units})</span>}
                <RequestLink url={urlByLayerId[layer.id]} />
              </>
            }
          >
            {renderBody(layer, query)}
          </QueryLayerItem>
        );
      })}
    </>
  );
};

export default TimeSeriesPanel;
