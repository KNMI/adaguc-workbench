import React from 'react';
import { WMLayer } from '@opengeoweb/webmap';
import { Button, TextField } from '@mui/material';
import { refreshLayerSource } from '../../utils/refreshLayerSource';

interface WMSColorRangeSelectorProps {
  wmLayer: WMLayer;
}
const WMSColorRangeSelector = ({
  wmLayer,
}: WMSColorRangeSelectorProps): React.ReactElement => {
  const [minValue, setMinValue] = React.useState<string>('');
  const [maxValue, setMaxValue] = React.useState<string>('');

  const parseWMSExtension = () => {
    const url = wmLayer?.wmsextensions?.url || '';
    const items = new URLSearchParams(url);
    const colorScaleRange = items.get('COLORSCALERANGE')?.trim();

    const colorScaleRangeItems = colorScaleRange?.split(',');
    const wmsMinValue =
      colorScaleRangeItems?.length === 2 ? colorScaleRangeItems[0] : '0.000';

    const wmsMaxValue =
      colorScaleRangeItems?.length === 2 ? colorScaleRangeItems[1] : '1.000';
    setMinValue(wmsMinValue);
    setMaxValue(wmsMaxValue);
  };

  React.useEffect(() => {
    parseWMSExtension();
  }, []);

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
