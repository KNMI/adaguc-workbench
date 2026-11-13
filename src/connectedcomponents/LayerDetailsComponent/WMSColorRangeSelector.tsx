import React from 'react';
import { WMLayer } from '@opengeoweb/webmap';
import { Button, TextField } from '@mui/material';
import { refreshLayerSource } from '../../utils/refreshLayerSource';

interface WMSColorRangeSelectorProps {
  wmLayer: WMLayer;
}
// The COLORSCALERANGE this layer currently requests (see updateColorRange
// below), or 0-1 when it doesn't set one.
const readColorScaleRange = (
  wmLayer: WMLayer,
): { min: string; max: string } => {
  const url = wmLayer?.wmsextensions?.url || '';
  const items = new URLSearchParams(url);
  const colorScaleRangeItems = items.get('COLORSCALERANGE')?.trim().split(',');
  return colorScaleRangeItems?.length === 2
    ? { min: colorScaleRangeItems[0], max: colorScaleRangeItems[1] }
    : { min: '0.000', max: '1.000' };
};

const WMSColorRangeSelector = ({
  wmLayer,
}: WMSColorRangeSelectorProps): React.ReactElement => {
  const [minValue, setMinValue] = React.useState(
    () => readColorScaleRange(wmLayer).min,
  );
  const [maxValue, setMaxValue] = React.useState(
    () => readColorScaleRange(wmLayer).max,
  );

  const updateColorRange = () => {
    const minValueFloat = parseFloat(minValue).toFixed(3);
    const maxValueFloat = parseFloat(maxValue).toFixed(3);
    setMinValue(`${minValueFloat}`);
    setMaxValue(`${maxValueFloat}`);
    // eslint-disable-next-line no-param-reassign
    wmLayer.wmsextensions.url = `&COLORSCALERANGE=${minValueFloat},${maxValueFloat}`;
    refreshLayerSource(wmLayer);
  };

  return (
    <div style={{ padding: '10px', background: 'white' }}>
      <TextField
        label="Min value"
        value={minValue}
        variant="outlined"
        onChange={(e) => setMinValue(e.target.value)}
        onKeyUp={(event) => {
          if (event.code === 'Enter') {
            updateColorRange();
          }
        }}
      />
      <br />
      <br />
      <TextField
        label="Max value"
        value={maxValue}
        variant="outlined"
        onChange={(e) => setMaxValue(e.target.value)}
        onKeyUp={(event) => {
          if (event.code === 'Enter') {
            updateColorRange();
          }
        }}
      />
      <br />
      <br />
      <Button
        variant="outlined"
        onClick={() => {
          // eslint-disable-next-line no-param-reassign
          wmLayer.wmsextensions.url = '';
          refreshLayerSource(wmLayer);
        }}
      >
        Reset
      </Button>
      <Button variant="outlined" onClick={updateColorRange}>
        Apply
      </Button>
    </div>
  );
};

export default WMSColorRangeSelector;
