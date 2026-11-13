/* eslint-disable no-console */
import * as React from 'react';
import { Box, IconButton, Slider, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { getWMLayerById } from '@opengeoweb/webmap';
import Checkbox from '@mui/material/Checkbox';
import { debounce } from 'lodash';

const CustomSlider = styled(Slider)(() => ({
  '& .MuiSlider-thumb': {
    transition: 'none',
  },
  '& .MuiSlider-track': {
    transition: 'none',
  },
}));

// The original value this slider always used - kept short so dragging
// still feels immediate (the layer visibly tracks the thumb), now that
// the expensive part of each commit (see lastCommittedValueRef below) is
// skipped. This still coalesces same-tick duplicate events rather than
// firing a GetMap request for every single one of them.
const DEBOUNCE_MS = 50;

interface WMSDimensionSliderProps {
  selectedDimensionValue: string;
  layerId: string;
  onSelectDimensionValue: (dimensionValue: string) => void;
  dimensionName: string;
  // Whether this dimension is "linked": changing it on any other linked
  // layer's matching dimension also updates this one to match.
  linked: boolean;
  onToggleLinked: (linked: boolean) => void;
}

const WMSDimensionSlider = ({
  selectedDimensionValue: selectedDimValue,
  layerId,
  onSelectDimensionValue: onSelectDimValue,
  dimensionName = 'time',
  linked,
  onToggleLinked,
}: WMSDimensionSliderProps): React.ReactElement<WMSDimensionSliderProps> | null => {
  const wmLayer = getWMLayerById(layerId);
  const layerDim = wmLayer?.getDimension(dimensionName);
  // All hooks run before the "no layer / no dimension" early returns
  // below, so every render calls the same hooks in the same order - the
  // layer (and so its dimension) can easily be missing on a first render
  // and only become available on a later one.
  const [stateDimIndex, setStateDimIndex] = React.useState<number>(0);
  // The last value this slider itself committed via onSelectDimValue -
  // when selectedDimValue's own prop update is just that same value
  // echoing back down (through redux), stateDimIndex is already correct
  // (set synchronously in handleChange below) and re-deriving it via
  // getIndexForValue is skipped. That matters because, for a dimension
  // with discrete "timevalues" (e.g. RADAR's own, with up to ~200,000
  // entries), WMJSDimension.getIndexForValue does a full linear scan -
  // parsing and comparing every single value - on every call; doing that
  // once per debounced commit during a drag is what makes the slider feel
  // sluggish. Only a genuinely external change (another linked layer's
  // slider, the TIME panel, ...) still needs the real lookup.
  const lastCommittedValueRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!layerDim || selectedDimValue === lastCommittedValueRef.current) {
      return;
    }
    setStateDimIndex(layerDim.getIndexForValue(selectedDimValue));
  }, [selectedDimValue, layerDim]);

  // Created once, on mount. Each change hands it a ready-made commit for
  // that change, built in handleChange below with that render's own
  // layerDim and onSelectDimValue - a fresh closure from the parent every
  // render, one that knows this layer's current position in the list. The
  // trailing call always runs the latest one handed in, so the debounced
  // function itself never needs to hold on to any of those values.
  const [debouncedCommit] = React.useState(() =>
    debounce((commit: () => void) => commit(), DEBOUNCE_MS, {
      leading: true,
      trailing: true,
      maxWait: DEBOUNCE_MS,
    }),
  );

  // Cancels a pending trailing commit if this slider unmounts mid-drag
  // (e.g. its layer is removed, or the panel closes) - otherwise it could
  // still fire afterwards for a slider that no longer exists.
  React.useEffect(() => () => debouncedCommit.cancel(), [debouncedCommit]);

  if (!wmLayer) {
    console.warn(`No layer exists for ${layerId}`);
    return null;
  }
  if (!layerDim) {
    console.warn(`No dimension exists for ${layerId}`);
    return null;
  }

  const handleChange = (_event: Event | null, value: number) => {
    let dimIndex = value;
    if (dimIndex < 0) dimIndex = 0;
    if (dimIndex > layerDim.size() - 1) dimIndex = layerDim.size() - 1;
    setStateDimIndex(dimIndex);
    debouncedCommit(() => {
      // Only resolved once the debounce actually commits it - most of a
      // drag's intermediate indexes never need a value at all.
      const newValue = layerDim.getValueForIndex(dimIndex) as string;
      lastCommittedValueRef.current = newValue;
      onSelectDimValue(newValue);
    });
  };

  return (
    <Box sx={{ height: '100%', margin: '0', padding: 0 }}>
      <Typography sx={{ fontSize: '12px' }}>
        Dimension {layerDim?.name} in {layerDim?.units} - ({stateDimIndex}-
        {layerDim.size()})
      </Typography>
      <div style={{ display: 'flex' }}>
        <Tooltip title="Link to other layers with this checked, so changing one changes them all together">
          <Checkbox
            style={{ padding: 0 }}
            checked={linked}
            onChange={(e, checked) => {
              onToggleLinked(checked);
            }}
            slotProps={{
              input: {
                'aria-label': `Link ${dimensionName} dimension for ${layerId}`,
              },
            }}
          />
        </Tooltip>
        <CustomSlider
          value={stateDimIndex}
          style={{ margin: '10px 0 0 5px', padding: 0 }}
          // A single-thumb slider always reports a single number.
          onChange={(event, value) => {
            handleChange(event, Array.isArray(value) ? value[0] : value);
          }}
          size="small"
          min={0}
          // The last valid index, not size() itself (an off-by-one past
          // it) - matches the clamp in handleChange above, so the thumb
          // can't be dragged to an index getValueForIndex has nothing for.
          max={layerDim.size() - 1}
          orientation="horizontal"
        />
        <IconButton
          style={{ marginLeft: '10px', fontSize: '12px' }}
          size="small"
          edge="end"
          color="inherit"
          onClick={() => {
            handleChange(null, stateDimIndex - 1);
          }}
        >
          <ArrowBackIosIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          style={{ fontSize: '12px' }}
          size="small"
          edge="end"
          color="inherit"
          onClick={() => {
            handleChange(null, stateDimIndex + 1);
          }}
        >
          <ArrowForwardIosIcon fontSize="inherit" />
        </IconButton>
      </div>
      <Typography sx={{ fontSize: '12px' }}>{selectedDimValue}</Typography>
    </Box>
  );
};

export default WMSDimensionSlider;
