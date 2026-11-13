import * as React from 'react';
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { getWMLayerById } from '@opengeoweb/webmap';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { selectors } from '../../store/selectors';
import { AdagucLayer, ViewerState } from '../../store/types';
import {
  buildTimeValueWindow,
  centerWindow,
  TimeWindowDimensionLike,
} from '../../utils/buildTimeValueWindow';

// The list's own row height, in px - fixed (rather than left to intrinsic
// content sizing) so the number of rows that fit the panel's available
// height can be computed from a plain division, with no DOM round-trip to
// measure an already-rendered row first. Must match the <tr> sx below.
const ROW_HEIGHT_PX = 22;

// Used only before the panel's own height has been measured (first
// render, and in tests, where jsdom never reports a real clientHeight) -
// see the rowsToFit state below, which replaces it as soon as it can.
const DEFAULT_ROWS_TO_FIT = 20;

interface LiveTimeDimension extends TimeWindowDimensionLike {
  getClosestValue(inputValue: string, evenWhenOutsideRange?: boolean): string;
}

interface LayerTimeEntry {
  layer: AdagucLayer;
  layerIndex: number;
  dimension: LiveTimeDimension;
}

const formatDatePart = (value: string): string => value.split('T')[0] ?? value;
const formatTimePart = (value: string): string => {
  const timePart = value.split('T')[1];
  if (!timePart) {
    return '';
  }
  const [hh, mm] = timePart.replace('Z', '').split(':');
  return `${hh}:${mm}z`;
};
// Matches the legacy tool's own "Local time" readout: the browser's
// local representation of the value, with the trailing "GMT+...(Name)"
// zone suffix stripped back off.
const formatLocalTime = (value: string): string =>
  new Date(value).toString().replace(/ GMT.*/, '');

// The row's own background colour: selected (the layer's current value)
// takes priority over latest, since that's what's actually being shown -
// see the isLatest tooltip for that case instead.
const rowColor = (
  isSelected: boolean,
  isLatest: boolean,
  variant: 'default' | 'hover',
): string => {
  if (isSelected) {
    return '#ff8080';
  }
  if (isLatest) {
    return variant === 'hover' ? '#5f96f5' : '#80b3ff';
  }
  return variant === 'hover' ? '#90e090' : '#aaffaa';
};

interface SpinnerFieldProps {
  label: string;
  value: string;
  width: number;
  onChangeText: (text: string) => void;
  onCommit: () => void;
  onStep: (delta: number) => void;
}

// A compact numeric field with its own up/down step buttons, rather than
// the browser's native number-input spinner - that one only updates the
// field's own displayed value, leaving the layer's time unchanged until
// a separate blur/Enter. Clicking either button here commits
// immediately instead, matching the legacy tool's own jQuery UI spinner.
// Typing a value still only commits on blur/Enter, so partial keystrokes
// (e.g. the "2" while typing "2025") don't each try to jump the time.
const SpinnerField = ({
  label,
  value,
  width,
  onChangeText,
  onCommit,
  onStep,
}: SpinnerFieldProps): React.ReactElement => (
  <TextField
    label={label}
    size="small"
    type="text"
    inputMode="numeric"
    sx={{ width, bgcolor: 'background.paper' }}
    value={value}
    onChange={(event) => onChangeText(event.target.value.replace(/\D/g, ''))}
    onBlur={onCommit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        onCommit();
      }
    }}
    slotProps={{
      input: {
        endAdornment: (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <IconButton
              size="small"
              aria-label={`Increase ${label}`}
              sx={{ p: 0 }}
              onClick={() => onStep(1)}
            >
              <ArrowDropUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={`Decrease ${label}`}
              sx={{ p: 0 }}
              onClick={() => onStep(-1)}
            >
              <ArrowDropDownIcon fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    }}
  />
);

export interface TimePanelProps {
  mapId: string;
}

// Ported from adaguc-viewer's legacy WMJSTimeSelector.js: a browsable
// list of nearby time steps merged across every enabled layer's own time
// dimension (see buildTimeValueWindow), step/jump buttons, direct
// date/time entry, and play/stop. Unlike the per-layer "link" checkbox
// (an opt-in subset - see WMSDimensionSlider), this always drives every
// enabled layer at once, each snapped to its own closest matching value -
// matching how the legacy tool's single, map-wide time dimension did.
const TimePanel = ({ mapId }: TimePanelProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const layers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const isAnimating = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.maps[mapId]?.isAnimating ?? false,
  );

  const enabledLayersWithTime = layers.reduce<LayerTimeEntry[]>(
    (acc, layer, layerIndex) => {
      if (!layer.enabled) {
        return acc;
      }
      const dimension = getWMLayerById(layer.id)?.getDimension('time');
      if (dimension) {
        acc.push({ layer, layerIndex, dimension });
      }
      return acc;
    },
    [],
  );

  // The topmost enabled, time-aware layer's own redux-tracked value
  // drives what the list below is centered on - matching the "driving
  // layer" convention AnimationClock already uses.
  const referenceEntry = enabledLayersWithTime[0];
  const currentValue = referenceEntry?.layer.dimensions.find(
    (dimension) => dimension.name === 'time',
  )?.currentValue;

  // The single most recent value across every enabled layer's own time
  // dimension - merged the same way buildTimeValueWindow merges them,
  // so a finer-grained layer's own later value wins over a coarser
  // layer's. Drives the "this is the latest timestep" row marker below.
  const latestValue = enabledLayersWithTime.reduce<string | undefined>(
    (latest, entry) => {
      const size = entry.dimension.size();
      if (size < 1) {
        return latest;
      }
      const value = String(entry.dimension.getValueForIndex(size - 1));
      return latest === undefined || value > latest ? value : latest;
    },
    undefined,
  );

  // How many rows actually fit the panel's available height, without a
  // scrollbar - measured against the list's own container (see listRef
  // below), and kept up to date across resizes via ResizeObserver.
  const [rowsToFit, setRowsToFit] = React.useState(DEFAULT_ROWS_TO_FIT);
  // The two-sided radius buildTimeValueWindow needs to gather enough raw
  // candidates to be able to fill rowsToFit rows once centered and
  // trimmed (see centerWindow below) - buildTimeValueWindow returns up
  // to 2*windowSize-1 entries near the middle of a layer's own range, so
  // this is the smallest radius that comfortably covers rowsToFit.
  const effectiveWindowSize = Math.max(1, Math.ceil((rowsToFit + 1) / 2));

  // Freshly recomputed every render, centered on currentValue - this is
  // what stepping/jumping are based on (see below), so they can always
  // make progress even from right at the edge of whatever's currently
  // on screen. It is NOT what's rendered as rows - see displayedValues.
  const liveWindowValues =
    currentValue !== undefined
      ? centerWindow(
          buildTimeValueWindow(
            enabledLayersWithTime.map((entry) => entry.dimension),
            currentValue,
            effectiveWindowSize,
          ),
          currentValue,
          rowsToFit,
        )
      : [];

  // Applies newValue to every enabled, time-aware layer at once, each
  // snapped to its own closest matching value rather than the exact same
  // string - different layers can have different time resolutions.
  const applyNewValue = (newValue: string): void => {
    enabledLayersWithTime.forEach(({ layerIndex, dimension }) => {
      dispatch(
        actions.changeLayerDimension({
          mapId,
          layerIndex,
          dimensionName: 'time',
          dimensionValue: dimension.getClosestValue(newValue, true),
        }),
      );
    });
  };

  const stepBackward = (): void => {
    if (liveWindowValues.length === 0 || currentValue === undefined) {
      return;
    }
    const index = liveWindowValues.indexOf(currentValue);
    applyNewValue(liveWindowValues[index <= 0 ? 0 : index - 1]);
  };
  const stepForward = (): void => {
    if (liveWindowValues.length === 0 || currentValue === undefined) {
      return;
    }
    const index = liveWindowValues.indexOf(currentValue);
    const lastIndex = liveWindowValues.length - 1;
    applyNewValue(
      liveWindowValues[
        index === -1 ? lastIndex : Math.min(lastIndex, index + 1)
      ],
    );
  };
  const jumpToStart = (): void => {
    if (liveWindowValues.length > 0) {
      applyNewValue(liveWindowValues[0]);
    }
  };
  const jumpToEnd = (): void => {
    if (liveWindowValues.length > 0) {
      applyNewValue(liveWindowValues[liveWindowValues.length - 1]);
    }
  };
  const togglePlay = (): void => {
    if (!referenceEntry) {
      return;
    }
    dispatch(
      actions.layerToggleAnimation({
        mapId,
        layerIndex: referenceEntry.layerIndex,
      }),
    );
  };

  // Direct year/month/day/hour/minute entry - local text state (synced
  // from currentValue whenever it changes elsewhere) rather than reading
  // straight from it, so typing a new value isn't clobbered by the
  // re-render that same keystroke can cause.
  const [yearText, setYearText] = React.useState('');
  const [monthText, setMonthText] = React.useState('');
  const [dayText, setDayText] = React.useState('');
  const [hourText, setHourText] = React.useState('');
  const [minuteText, setMinuteText] = React.useState('');

  React.useEffect(() => {
    if (currentValue === undefined) {
      return;
    }
    const [datePart, timePart] = currentValue.split('T');
    const [y, m, d] = (datePart ?? '').split('-');
    const [hh, mm] = (timePart ?? '').replace('Z', '').split(':');
    setYearText(y ?? '');
    setMonthText(m ?? '');
    setDayText(d ?? '');
    setHourText(hh ?? '');
    setMinuteText(mm ?? '');
  }, [currentValue]);

  // Composes the 5 fields (any of which can be overridden with a value
  // not yet reflected in state - see the step handlers below, which need
  // to commit the value they just computed without waiting for the
  // render that state update triggers) into a candidate ISO value and
  // applies it - applyNewValue's own per-layer getClosestValue snaps it
  // to the nearest actually-available step, so this doesn't need to be
  // an exact match itself.
  const commitFieldsWith = (
    overrides: Partial<{
      year: string;
      month: string;
      day: string;
      hour: string;
      minute: string;
    }>,
  ): void => {
    const year = overrides.year ?? yearText;
    const month = overrides.month ?? monthText;
    const day = overrides.day ?? dayText;
    const hour = overrides.hour ?? hourText;
    const minute = overrides.minute ?? minuteText;
    if (!year || !month || !day || !hour || !minute) {
      return;
    }
    const pad = (value: string, length: number): string =>
      value.padStart(length, '0');
    applyNewValue(
      `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(
        minute,
        2,
      )}:00Z`,
    );
  };
  const commitFields = (): void => commitFieldsWith({});

  // The rows actually rendered below - unlike liveWindowValues (recentered
  // on currentValue every render), this is sticky: ported from the legacy
  // tool's own generate(), which only rebuilds its rendered row list when
  // the new currentValue isn't one of the rows already on screen (or the
  // set of contributing layers/dimensions changed), and otherwise just
  // moves which row is marked selected. Without this, every single step
  // would re-center the list and the selected row would never appear to
  // move - the legacy tool instead walks it toward the top/bottom of a
  // fixed page, only paging to a freshly centered list once you step past
  // either edge of what's currently shown.
  // rowsToFit is folded in here too: a resize that changes how many rows
  // fit also needs a rebuild (re-trim), the same as a changed signature -
  // reusing the old, differently-sized list would either leave a gap or
  // need a scrollbar again.
  const pageSignature = `${enabledLayersWithTime
    .map((entry) => entry.layer.id)
    .join('|')}@${rowsToFit}`;
  const [displayedValues, setDisplayedValues] = React.useState<string[]>([]);
  const prevSignatureRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const signatureChanged = prevSignatureRef.current !== pageSignature;
    prevSignatureRef.current = pageSignature;
    if (currentValue === undefined) {
      setDisplayedValues([]);
      return;
    }
    setDisplayedValues((prev) => {
      if (!signatureChanged && prev.includes(currentValue)) {
        return prev;
      }
      return centerWindow(
        buildTimeValueWindow(
          enabledLayersWithTime.map((entry) => entry.dimension),
          currentValue,
          effectiveWindowSize,
        ),
        currentValue,
        rowsToFit,
      );
    });
    // enabledLayersWithTime/effectiveWindowSize are recreated every render -
    // pageSignature (built from rowsToFit and the layers' own stable ids)
    // is their proxy, so a real change in what should be on screen is what
    // re-triggers this, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, pageSignature]);

  // Mouse-wheel-to-step, matching the legacy tool's own
  // addMouseWheelEvent (scrolling over the list steps through time one
  // value at a time, same as the </> buttons, instead of scrolling the
  // list view). React's synthetic onWheel attaches a passive listener,
  // so event.preventDefault() there is silently ignored - this attaches
  // a real, non-passive listener instead. stepBackward/stepForward are
  // plain functions recreated every render, so the handler reaches the
  // latest ones through a ref rather than needing to be re-created.
  //
  // A callback ref (not an effect) does the attaching: this component
  // stays mounted even while its tab is hidden (see SideToolPanel), and
  // first mounts showing the "no enabled layers" empty state before any
  // layer's time dimension is available - i.e. before the table below
  // even exists. An effect with a fixed dependency array would only run
  // once, against that first (table-less) render, and never reattach
  // once the table actually appears; a callback ref is invoked by React
  // on every real mount/unmount of the node, so it can't miss that.
  const selectedRowRef = React.useRef<HTMLTableRowElement>(null);
  const stepBackwardRef = React.useRef(stepBackward);
  stepBackwardRef.current = stepBackward;
  const stepForwardRef = React.useRef(stepForward);
  stepForwardRef.current = stepForward;

  const handleWheel = React.useCallback((event: WheelEvent): void => {
    event.preventDefault();
    if (event.deltaY < 0) {
      stepBackwardRef.current();
    } else if (event.deltaY > 0) {
      stepForwardRef.current();
    }
  }, []);

  // Measures how many ROW_HEIGHT_PX-tall rows actually fit the list
  // container's own height, so the panel never needs its own scrollbar -
  // same callback-ref reasoning as the wheel listener above (this
  // container doesn't exist yet on the component's first, empty-state
  // render), plus a ResizeObserver so resizing the window or the side
  // panel itself keeps the row count matching. Guarded for jsdom (the
  // test suite), which has neither ResizeObserver nor real layout.
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const attachedListElementRef = React.useRef<HTMLTableElement | null>(null);
  const listRef = React.useCallback(
    (node: HTMLTableElement | null): void => {
      attachedListElementRef.current?.removeEventListener('wheel', handleWheel);
      attachedListElementRef.current = node;
      node?.addEventListener('wheel', handleWheel, { passive: false });

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (node && typeof ResizeObserver !== 'undefined') {
        const updateRowsToFit = (): void => {
          const fitted = Math.floor(node.clientHeight / ROW_HEIGHT_PX);
          if (fitted > 0) {
            setRowsToFit(fitted);
          }
        };
        updateRowsToFit();
        const observer = new ResizeObserver(updateRowsToFit);
        observer.observe(node);
        resizeObserverRef.current = observer;
      }
    },
    [handleWheel],
  );

  // Keeps the highlighted row in view - repeated wheel-stepping would
  // otherwise walk it straight out of the visible, scrollable list.
  React.useEffect(() => {
    // jsdom (used by the test suite) doesn't implement scrollIntoView.
    selectedRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [currentValue]);

  const stepYear = (delta: number): void => {
    const next = String((Number(yearText) || 0) + delta);
    setYearText(next);
    commitFieldsWith({ year: next });
  };
  const stepMonth = (delta: number): void => {
    const next = String((Number(monthText) || 0) + delta);
    setMonthText(next);
    commitFieldsWith({ month: next });
  };
  const stepDay = (delta: number): void => {
    const next = String((Number(dayText) || 0) + delta);
    setDayText(next);
    commitFieldsWith({ day: next });
  };
  const stepHour = (delta: number): void => {
    const next = String((Number(hourText) || 0) + delta);
    setHourText(next);
    commitFieldsWith({ hour: next });
  };
  const stepMinute = (delta: number): void => {
    const next = String((Number(minuteText) || 0) + delta);
    setMinuteText(next);
    commitFieldsWith({ minute: next });
  };

  if (!referenceEntry || currentValue === undefined) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No enabled layers have a time dimension.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: '#ccccee',
      }}
    >
      <Box sx={{ p: 1, textAlign: 'center' }}>
        <Typography variant="body2">Local time:</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {formatLocalTime(currentValue)}
        </Typography>
      </Box>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ px: 1, pb: 1, justifyContent: 'center' }}
      >
        <SpinnerField
          label="Year"
          value={yearText}
          width={96}
          onChangeText={setYearText}
          onCommit={commitFields}
          onStep={stepYear}
        />
        <SpinnerField
          label="Month"
          value={monthText}
          width={72}
          onChangeText={setMonthText}
          onCommit={commitFields}
          onStep={stepMonth}
        />
        <SpinnerField
          label="Day"
          value={dayText}
          width={72}
          onChangeText={setDayText}
          onCommit={commitFields}
          onStep={stepDay}
        />
        <SpinnerField
          label="Hour"
          value={hourText}
          width={72}
          onChangeText={setHourText}
          onCommit={commitFields}
          onStep={stepHour}
        />
        <SpinnerField
          label="Min"
          value={minuteText}
          width={72}
          onChangeText={setMinuteText}
          onCommit={commitFields}
          onStep={stepMinute}
        />
      </Stack>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ px: 1, pb: 1, justifyContent: 'center' }}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={jumpToStart}
          aria-label="Jump to earliest shown"
        >
          &lt;&lt;
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={stepBackward}
          aria-label="Step back"
        >
          &lt;
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={stepForward}
          aria-label="Step forward"
        >
          &gt;
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={jumpToEnd}
          aria-label="Jump to latest shown"
        >
          &gt;&gt;
        </Button>
      </Stack>
      <Box
        component="table"
        ref={listRef}
        sx={{
          borderCollapse: 'collapse',
          width: '100%',
          overflowY: 'auto',
          flexGrow: 1,
          minHeight: 0,
          display: 'block',
        }}
      >
        <Box component="tbody" sx={{ display: 'block' }}>
          {displayedValues.map((value) => {
            const isSelected = value === currentValue;
            // The most recent value across every enabled layer's own
            // dimension (see latestValue above) - marked blue, with a
            // tooltip, rather than overriding the selected row's own red
            // when both coincide (the common case for a "live" layer).
            const isLatest = value === latestValue;
            const row = (
              <Box
                component="tr"
                ref={isSelected ? selectedRowRef : undefined}
                onClick={() => applyNewValue(value)}
                sx={{
                  display: 'table',
                  tableLayout: 'fixed',
                  width: '100%',
                  // Fixed, rather than left to intrinsic content sizing -
                  // see ROW_HEIGHT_PX, which this must match so rowsToFit
                  // (computed from the container's own height) comes out
                  // right.
                  height: ROW_HEIGHT_PX,
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  // No separate "loaded" tracking exists in this app (the
                  // legacy tool's version came from low-level prefetch
                  // bookkeeping this one doesn't have access to) - every
                  // row other than the current one gets its "available"
                  // colour instead, unless it's the latest timestep.
                  bgcolor: rowColor(isSelected, isLatest, 'default'),
                  '&:hover': {
                    bgcolor: rowColor(isSelected, isLatest, 'hover'),
                  },
                }}
              >
                <Box
                  component="td"
                  sx={{
                    borderTop: '1px solid black',
                    borderBottom: '1px solid black',
                    width: '50%',
                    fontSize: 14,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    py: 0.25,
                  }}
                >
                  {formatDatePart(value)}
                </Box>
                <Box
                  component="td"
                  sx={{
                    borderTop: '1px solid black',
                    borderBottom: '1px solid black',
                    width: '50%',
                    fontSize: 14,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    py: 0.25,
                  }}
                >
                  {formatTimePart(value) + (isLatest ? '*' : '')}
                </Box>
              </Box>
            );
            if (!isLatest) {
              return <React.Fragment key={value}>{row}</React.Fragment>;
            }
            return (
              <Tooltip
                key={value}
                title="This is the latest timestep"
                placement="right"
              >
                {row}
              </Tooltip>
            );
          })}
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ p: 1, justifyContent: 'center' }}
      >
        <Button size="small" variant="outlined" onClick={togglePlay}>
          {isAnimating ? 'Stop' : 'Play animation'}
        </Button>
      </Stack>
    </Box>
  );
};

export default TimePanel;
