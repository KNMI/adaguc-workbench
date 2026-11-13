import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Button,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { getWMLayerById } from '@opengeoweb/webmap';
import { MapLocation } from '@opengeoweb/webmap-react';
import '../../assets/styles.css';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { selectors } from '../../store/selectors';
import {
  AdagucHistogramBox,
  AdagucLayer,
  ViewerState,
} from '../../store/types';
import { getFeatureInfoUrl } from '../../utils/getFeatureInfoUrl';
import sanitizeHTML from '../../utils/sanitizeHTML';
import { extractServiceErrorMessage } from '../../utils/extractServiceErrorMessage';
import {
  DEFAULT_MAX_TIME_STEPS,
  getTimeDimensionRange,
  getTimeSeriesUrl,
  TimeRange,
} from '../../utils/getTimeSeriesUrl';
import {
  parseTimeSeriesResponse,
  TimeSeriesResult,
} from '../../utils/parseTimeSeriesResponse';
import { SERIES_DIMENSION_NAMES } from '../../utils/seriesDimensions';
import { getHistogramUrl } from '../../utils/getHistogramUrl';
import {
  HistogramResult,
  parseHistogramResponse,
} from '../../utils/parseHistogramResponse';

export interface QueryPanelProps {
  mapId: string;
  // Whether the Query tab itself is the one currently shown - this panel
  // stays mounted (just hidden) while another main tab is active, so it
  // can't rely on unmounting to know it should stop owning the map's
  // histogram box-select interaction.
  isActive: boolean;
}

type SubTab = 'GetFeatureInfo' | 'TimeSeries' | 'Histogram';

// Identifies one series' legend entry within one layer's chart (each layer
// renders its own chart/legend, so the dataKey alone isn't enough).
interface SeriesKey {
  layerId: string;
  dataKey: string;
}

type LayerTimeSeriesState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'done'; result: TimeSeriesResult };

type LayerHistogramState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'done'; result: HistogramResult };

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

const formatTimeTick = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatHistogramTick = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const MAX_QUERY_LIMIT_PATTERN = /maxquerylimit=(\d+)/i;

// Several things can trigger a new timeseries request in quick succession
// - clicking a new map point, editing the Start/End fields keystroke by
// keystroke, and especially "Follow current time" (see QueryPanel's own
// followCurrentTime), which can refetch on every single animation/step
// tick. Debouncing the fetch effect itself (rather than, say, each input
// field separately) covers all of these the same way: only the last of a
// rapid burst of changes actually reaches the server.
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
  const wmLayer = getWMLayerById(layer.id);
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
// getTimeSeriesUrl) scaled down together when the server rejects the
// full request for exceeding its own maxquerylimit, rather than that
// just being a dead end.
const fetchTimeSeriesForLayer = (
  layer: AdagucLayer,
  mapPinLocation: MapLocation,
  setTimeSeriesResults: React.Dispatch<
    React.SetStateAction<Record<string, LayerTimeSeriesState>>
  >,
  dimensionLimits?: Record<string, number>,
  timeRangeOverride?: TimeRange,
): void => {
  const url = getTimeSeriesUrl(
    layer,
    mapPinLocation,
    dimensionLimits,
    timeRangeOverride,
  );
  if (!url) {
    return;
  }
  setTimeSeriesResults((prev) => ({
    ...prev,
    [layer.id]: { status: 'loading' },
  }));
  fetch(url)
    .then((r) => r.text().then((text) => ({ ok: r.ok, text })))
    .then(({ ok, text }) => {
      // A failed request (e.g. past the server's own query limit)
      // responds with a non-2xx status and an OGC
      // <ServiceExceptionReport> body instead of the requested JSON.
      if (!ok) {
        const message = extractServiceErrorMessage(text);
        // Only retry once - dimensionLimits being already set here means
        // this fetch *was* the retry, so a second failure just reports
        // normally rather than retrying forever.
        const limitMatch = dimensionLimits
          ? null
          : MAX_QUERY_LIMIT_PATTERN.exec(message);
        const retryDimensionLimits = limitMatch
          ? computeDimensionLimits(layer, Number(limitMatch[1]))
          : undefined;
        if (retryDimensionLimits) {
          fetchTimeSeriesForLayer(
            layer,
            mapPinLocation,
            setTimeSeriesResults,
            retryDimensionLimits,
            timeRangeOverride,
          );
          return;
        }
        setTimeSeriesResults((prev) => ({
          ...prev,
          [layer.id]: { status: 'error', message },
        }));
        return;
      }
      const result = parseTimeSeriesResponse(JSON.parse(text));
      setTimeSeriesResults((prev) => ({
        ...prev,
        [layer.id]: result ? { status: 'done', result } : { status: 'error' },
      }));
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      setTimeSeriesResults((prev) => ({
        ...prev,
        [layer.id]: { status: 'error' },
      }));
    });
};

const QueryPanel = ({
  mapId,
  isActive,
}: QueryPanelProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const theme = useTheme();

  const [subTab, setSubTab] = React.useState<SubTab>('GetFeatureInfo');

  const [getFeatureInfoResults, setGetFeatureInfoResults] = React.useState<
    Record<string, string>
  >({});
  const [timeSeriesResults, setTimeSeriesResults] = React.useState<
    Record<string, LayerTimeSeriesState>
  >({});
  const [histogramResults, setHistogramResults] = React.useState<
    Record<string, LayerHistogramState>
  >({});
  // Which series' legend entry is currently hovered (per layer, since each
  // one renders its own chart/legend) - the rest of that chart's lines are
  // dimmed below while this is set, so the hovered one stands out. This
  // always wins over any pinned selection below, but only while it lasts.
  const [hoveredSeries, setHoveredSeries] = React.useState<SeriesKey | null>(
    null,
  );
  // Series "pinned" by clicking their legend entry rather than just
  // hovering them - any number can be pinned per layer at once, and each
  // stays highlighted once the mouse moves away, until its own entry is
  // clicked again to un-pin it.
  const [pinnedSeriesByLayer, setPinnedSeriesByLayer] = React.useState<
    Record<string, ReadonlySet<string>>
  >({});
  // The user's own explicit start/end for the TimeSeries request, set via
  // the two editable fields below - undefined means "automatic" (each
  // layer's own default range, windowed to DEFAULT_MAX_TIME_STEPS - see
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
    (state: ViewerState): MapLocation =>
      state?.viewer?.maps[mapId]?.mapPinLocation,
  );
  const isBoxSelectActive = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.maps[mapId]?.isHistogramBoxSelectActive,
  );
  const histogramBox = useAppSelector(
    (state: ViewerState): AdagucHistogramBox | undefined =>
      state?.viewer?.maps[mapId]?.histogramBox,
  );

  const enabledLayers = layers.filter((layer) => layer.enabled);

  // Box-select is a conscious opt-in (the button below), not turned on just
  // by viewing the Histogram subtab - but it must not stay active once the
  // user has navigated away from it, whether by switching subtabs or by
  // switching to an entirely different main tab (this panel stays mounted
  // either way, so neither case unmounts it on its own).
  React.useEffect(() => {
    if (!isActive || subTab !== 'Histogram') {
      dispatch(actions.setHistogramBoxSelectActive({ mapId, active: false }));
    }
  }, [mapId, isActive, subTab, dispatch]);

  // getTimeSeriesUrl always requests the layer's full time range (not its
  // current value) and widens any percentile/member/ensemble dimension to
  // "*" - so neither actually affects the request URL. Without this, the
  // raw `layers` array (a new reference on every dimension change, e.g.
  // every animation tick) made the fetch effect below re-run - and erase
  // and reload every chart - each time the time slider moved, even though
  // nothing it requested had changed.
  const timeSeriesFetchKey = React.useMemo(
    () =>
      JSON.stringify(
        enabledLayers.map((layer) => ({
          id: layer.id,
          serviceUrl: layer.serviceUrl,
          style: layer.style,
          dimensions: layer.dimensions
            .filter(
              (dimension) =>
                dimension.name !== 'time' &&
                !SERIES_DIMENSION_NAMES.has(dimension.name),
            )
            .map((dimension) => ({
              name: dimension.name,
              currentValue: dimension.currentValue,
            })),
        })),
      ),
    [enabledLayers],
  );

  // The range shown in the two editable fields below before the user has
  // set their own override - the first enabled, time-aware layer's own
  // default range (see getTimeSeriesUrl), so the fields start out matching
  // whatever would actually be requested automatically. Deliberately NOT
  // memoized on timeSeriesFetchKey (or anything else derived from redux):
  // getWMLayerById reads a live registry the webmap library populates
  // asynchronously, outside React/redux entirely, so a layer can already
  // be enabled in redux before its own live WMLayer (and dimension) exists
  // - memoizing on a redux-derived key could permanently cache that
  // not-ready-yet "undefined" from an early render, with nothing left to
  // ever invalidate it once the registry actually catches up. Recomputing
  // on every render instead keeps this always reading the registry's
  // current state; it's just a couple of lookups, cheap enough to not
  // need memoizing.
  const referenceLayer = enabledLayers.find(
    (layer) => !!getWMLayerById(layer.id)?.getDimension('time'),
  );
  const defaultTimeDimension = referenceLayer
    ? getWMLayerById(referenceLayer.id)?.getDimension('time')
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
  // A plain string, rather than activeTimeRangeOverride itself, drives the
  // fetch effect below - same reasoning as effectiveTimeRangeKey just
  // below (a new object every render otherwise) - this is what lets
  // "follow" actually refetch as the current value moves, without
  // depending on every dimension change across every layer (which
  // timeSeriesFetchKey deliberately excludes - see its own comment).
  const activeTimeRangeOverrideKey = activeTimeRangeOverride
    ? `${activeTimeRangeOverride.start}/${activeTimeRangeOverride.end}`
    : '';

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
  React.useEffect(() => {
    setStartText(effectiveTimeRange?.start ?? '');
    setEndText(effectiveTimeRange?.end ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTimeRangeKey]);

  // Mirrors the time series one: only the fields that actually affect the
  // histogram request should cause a refetch.
  const histogramFetchKey = React.useMemo(
    () =>
      JSON.stringify(
        enabledLayers.map((layer) => ({
          id: layer.id,
          serviceUrl: layer.serviceUrl,
          style: layer.style,
          dimensions: layer.dimensions,
        })),
      ),
    [enabledLayers],
  );

  // Not gated on which subtab is shown: GetFeatureInfo and TimeSeries share
  // the same map-click pin, so fetching here whenever the pin moves (even
  // from the other subtab) keeps both ready instead of erasing/refetching
  // every time the user switches subtabs back to one of them.
  React.useEffect(() => {
    if (!mapPinLocation) {
      return;
    }
    setGetFeatureInfoResults({});
    layers
      .filter((layer) => layer.enabled)
      .forEach((layer) => {
        const url = getFeatureInfoUrl(layer, mapPinLocation);
        if (!url) {
          return;
        }
        fetch(url)
          .then((r) => r.text())
          .then((t) => {
            setGetFeatureInfoResults((prev) => ({ ...prev, [layer.id]: t }));
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error(e);
          });
      });
  }, [mapPinLocation, layers]);

  React.useEffect(() => {
    if (!mapPinLocation) {
      return undefined;
    }
    // Debounced: a burst of changes within TIMESERIES_FETCH_DEBOUNCE_MS of
    // each other (rapid Start/End keystrokes, "Follow current time"
    // ticking every animation step, ...) only actually fetches once, for
    // the last one - each new change here reschedules the timeout rather
    // than piling another request on top of the previous (still in
    // flight) one. The previously loaded chart is left as-is until then,
    // rather than clearing it (and briefly flashing "Loading…") for
    // changes that are about to be superseded anyway.
    const timeoutId = setTimeout(() => {
      setTimeSeriesResults({});
      // A pinned selection from a previous dataset could otherwise point
      // at a series (e.g. a member number) that doesn't exist in the new
      // one.
      setPinnedSeriesByLayer({});
      layers
        .filter((layer) => layer.enabled)
        .forEach((layer) => {
          fetchTimeSeriesForLayer(
            layer,
            mapPinLocation,
            setTimeSeriesResults,
            undefined,
            activeTimeRangeOverride,
          );
        });
    }, TIMESERIES_FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPinLocation, timeSeriesFetchKey, activeTimeRangeOverrideKey]);

  React.useEffect(() => {
    if (!histogramBox) {
      return;
    }
    setHistogramResults({});
    enabledLayers.forEach((layer) => {
      const url = getHistogramUrl(
        layer,
        histogramBox.bbox,
        histogramBox.srs,
        histogramBox.pixelWidth,
        histogramBox.pixelHeight,
      );
      if (!url) {
        return;
      }
      setHistogramResults((prev) => ({
        ...prev,
        [layer.id]: { status: 'loading' },
      }));
      fetch(url)
        .then((r) => r.text().then((text) => ({ ok: r.ok, text })))
        .then(({ ok, text }) => {
          // Mirrors the TimeSeries fetch above: a failed request responds
          // with a non-2xx status and an OGC <ServiceExceptionReport> body
          // instead of the requested JSON.
          if (!ok) {
            setHistogramResults((prev) => ({
              ...prev,
              [layer.id]: {
                status: 'error',
                message: extractServiceErrorMessage(text),
              },
            }));
            return;
          }
          const result = parseHistogramResponse(JSON.parse(text));
          setHistogramResults((prev) => ({
            ...prev,
            [layer.id]: result
              ? { status: 'done', result }
              : { status: 'error' },
          }));
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error(e);
          setHistogramResults((prev) => ({
            ...prev,
            [layer.id]: { status: 'error' },
          }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histogramBox, histogramFetchKey]);

  const jumpLayerToTime = (layer: AdagucLayer, time: string): void => {
    const layerIndex = layers.findIndex((l) => l.id === layer.id);
    if (layerIndex === -1) {
      return;
    }
    // Snap to the dimension's own value representation (as getMapDimURL
    // does for dimension overrides elsewhere), so this matches exactly
    // what the time slider would set and the slider picks up the change.
    const timeDimension = getWMLayerById(layer.id)?.getDimension('time');
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

  const renderGetFeatureInfoBody = (layer: AdagucLayer): React.ReactNode => (
    <div
      className="getfeatureinfo_result_contents"
      dangerouslySetInnerHTML={sanitizeHTML(
        getFeatureInfoResults[layer.id] || '--',
      )}
    />
  );

  const renderTimeSeriesBody = (layer: AdagucLayer): React.ReactNode => {
    const url = mapPinLocation
      ? getTimeSeriesUrl(
          layer,
          mapPinLocation,
          undefined,
          activeTimeRangeOverride,
        )
      : undefined;
    const state = timeSeriesResults[layer.id];

    if (!mapPinLocation) {
      return 'Click on the map to select a point';
    }
    if (!url) {
      return 'No time dimension for this layer';
    }
    if (!state || state.status === 'loading') {
      return 'Loading…';
    }
    if (state.status === 'error') {
      return state.message ? (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          Failed to load timeseries: {state.message}
        </span>
      ) : (
        'Failed to load timeseries'
      );
    }
    if (state.result.series.every((s) => s.points.length === 0)) {
      return 'No data for this point';
    }

    const { result } = state;
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
    const pinnedSeries = pinnedSeriesByLayer[layer.id];
    let activeDataKeys: ReadonlySet<string> | null = null;
    if (hoveredSeries?.layerId === layer.id) {
      activeDataKeys = new Set([hoveredSeries.dataKey]);
    } else if (pinnedSeries && pinnedSeries.size > 0) {
      activeDataKeys = pinnedSeries;
    }

    const toggleSeriesPin = (dataKey: string): void => {
      setPinnedSeriesByLayer((previous) => {
        const current = new Set(previous[layer.id]);
        // Clicking an already-pinned entry un-pins just that one, rather
        // than only ever adding more pins.
        if (current.has(dataKey)) {
          current.delete(dataKey);
        } else {
          current.add(dataKey);
        }
        return { ...previous, [layer.id]: current };
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
            labelFormatter={(value: string) => formatTimeTick(value)}
            formatter={(value: number, name: string) => [
              `${value} ${result.units ?? ''}`.trim(),
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

  const renderHistogramBody = (layer: AdagucLayer): React.ReactNode => {
    const url = histogramBox
      ? getHistogramUrl(
          layer,
          histogramBox.bbox,
          histogramBox.srs,
          histogramBox.pixelWidth,
          histogramBox.pixelHeight,
        )
      : undefined;
    const state = histogramResults[layer.id];

    if (!histogramBox) {
      return 'Select an area on the map to see its histogram';
    }
    if (!url) {
      return 'Layer is not ready yet';
    }
    if (!state || state.status === 'loading') {
      return 'Loading…';
    }
    if (state.status === 'error') {
      return state.message ? (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          Failed to load histogram: {state.message}
        </span>
      ) : (
        'Failed to load histogram'
      );
    }
    if (state.result.bins.length === 0) {
      return 'No data for this area';
    }

    const { result } = state;
    const chartData = result.bins.map((bin) => ({
      value: bin.value,
      count: bin.count,
    }));

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid
            stroke={theme.palette.divider}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="value"
            tickFormatter={formatHistogramTick}
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            minTickGap={20}
            label={
              result.units
                ? {
                    value: result.units,
                    position: 'insideBottom',
                    offset: -5,
                    fontSize: 11,
                    fill: theme.palette.text.secondary,
                  }
                : undefined
            }
          />
          <YAxis
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            width={55}
            label={{
              value: 'count',
              angle: -90,
              position: 'insideLeft',
              fontSize: 11,
              fill: theme.palette.text.secondary,
            }}
          />
          <Tooltip
            labelFormatter={(value: number) =>
              `${formatHistogramTick(value)} ${result.units ?? ''}`.trim()
            }
          />
          <Bar
            dataKey="count"
            fill={theme.palette.primary.main}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderCaption = (layer: AdagucLayer): React.ReactNode => {
    if (subTab === 'GetFeatureInfo') {
      const url = mapPinLocation
        ? getFeatureInfoUrl(layer, mapPinLocation)
        : undefined;
      return (
        url && (
          <a target="_blank" rel="noreferrer" href={url}>
            &#x29c9;
          </a>
        )
      );
    }
    if (subTab === 'TimeSeries') {
      const url = mapPinLocation
        ? getTimeSeriesUrl(
            layer,
            mapPinLocation,
            undefined,
            activeTimeRangeOverride,
          )
        : undefined;
      const state = timeSeriesResults[layer.id];
      return (
        <>
          {state?.status === 'done' && state.result.units && (
            <span>({state.result.units})</span>
          )}
          {url && (
            <a target="_blank" rel="noreferrer" href={url}>
              &#x29c9;
            </a>
          )}
        </>
      );
    }
    const url = histogramBox
      ? getHistogramUrl(
          layer,
          histogramBox.bbox,
          histogramBox.srs,
          histogramBox.pixelWidth,
          histogramBox.pixelHeight,
        )
      : undefined;
    const state = histogramResults[layer.id];
    return (
      <>
        {state?.status === 'done' && (
          <span>
            min {formatHistogramTick(state.result.min)}, max{' '}
            {formatHistogramTick(state.result.max)}, avg{' '}
            {formatHistogramTick(state.result.average)}
            {state.result.units ? ` ${state.result.units}` : ''}
          </span>
        )}
        {url && (
          <a target="_blank" rel="noreferrer" href={url}>
            &#x29c9;
          </a>
        )}
      </>
    );
  };

  const renderBody = (layer: AdagucLayer): React.ReactNode => {
    if (subTab === 'GetFeatureInfo') {
      return renderGetFeatureInfoBody(layer);
    }
    if (subTab === 'TimeSeries') {
      return renderTimeSeriesBody(layer);
    }
    return renderHistogramBody(layer);
  };

  const subTabInstructions: Record<SubTab, string> = {
    GetFeatureInfo: 'Click on the map for info at that point.',
    TimeSeries:
      "Click on the map for a time series at that point. Click a dot on the chart to set the layer's time to that value.",
    Histogram: 'Select an area on the map for a histogram of that area.',
  };

  return (
    <div className="query_panel">
      <div className="query_panel_header">
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <Button
            size="small"
            variant={subTab === 'GetFeatureInfo' ? 'contained' : 'outlined'}
            onClick={() => setSubTab('GetFeatureInfo')}
          >
            GetFeatureInfo
          </Button>
          <Button
            size="small"
            variant={subTab === 'TimeSeries' ? 'contained' : 'outlined'}
            onClick={() => setSubTab('TimeSeries')}
          >
            TimeSeries
          </Button>
          <Button
            size="small"
            variant={subTab === 'Histogram' ? 'contained' : 'outlined'}
            onClick={() => setSubTab('Histogram')}
          >
            Histogram
          </Button>
        </div>
        <Typography variant="body2">{subTabInstructions[subTab]}</Typography>
        {subTab === 'TimeSeries' && (
          <div style={{ marginTop: 8 }}>
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
                      // them, rather than snapping back to an older
                      // manual override (or the automatic default) set
                      // before following was turned on.
                      setTimeRangeOverride(followedTimeRange);
                    }
                    setFollowCurrentTime(checked);
                  }}
                />
              }
              label="Follow current time"
            />
          </div>
        )}
        {subTab === 'Histogram' && (
          <div style={{ marginTop: 8 }}>
            <Button
              size="small"
              variant={isBoxSelectActive ? 'contained' : 'outlined'}
              onClick={() => {
                dispatch(
                  actions.setHistogramBoxSelectActive({
                    mapId,
                    active: !isBoxSelectActive,
                  }),
                );
              }}
            >
              {isBoxSelectActive
                ? 'Click and drag a box on the map…'
                : 'Select area for histogram'}
            </Button>
          </div>
        )}
      </div>
      {enabledLayers.length === 0 && <div>No layers added</div>}
      {enabledLayers.map((layer) => (
        <div key={layer.id} className="query_panel_item">
          <div className="query_panel_item_header">
            <code>{layer.name}</code>
          </div>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            {subTab}
            {renderCaption(layer)}
          </Typography>
          <div className="query_panel_item_body">{renderBody(layer)}</div>
        </div>
      ))}
    </div>
  );
};

export default QueryPanel;
