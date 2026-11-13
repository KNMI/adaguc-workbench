import * as React from 'react';
import { Button, Typography } from '@mui/material';
import '../../assets/styles.css';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { selectors } from '../../store/selectors';
import { AdagucLayer, ViewerState } from '../../store/types';
import { SubTab } from './query/queryShared';
import GetFeatureInfoPanel from './query/GetFeatureInfoPanel';
import TimeSeriesPanel from './query/TimeSeriesPanel';
import HistogramPanel from './query/HistogramPanel';

export interface QueryPanelProps {
  mapId: string;
  // Whether the Query tab itself is the one currently shown - this panel
  // stays mounted (just hidden) while another main tab is active, so it
  // can't rely on unmounting to know it should stop owning the map's
  // histogram box-select interaction.
  isActive: boolean;
}

const SUB_TABS: SubTab[] = ['GetFeatureInfo', 'TimeSeries', 'Histogram'];

const subTabInstructions: Record<SubTab, string> = {
  GetFeatureInfo: 'Click on the map for info at that point.',
  TimeSeries:
    "Click on the map for a time series at that point. Click a dot on the chart to set the layer's time to that value.",
  Histogram: 'Select an area on the map for a histogram of that area.',
};

// The Query tab: switches between its three subtabs. Each subtab lives in
// its own component (see ./query), all three always mounted - so each
// keeps its own state (e.g. TimeSeries' time range fields) and keeps
// fetching for the current pin/box while another subtab is shown - with
// only the selected one rendering anything.
const QueryPanel = ({
  mapId,
  isActive,
}: QueryPanelProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const [subTab, setSubTab] = React.useState<SubTab>('GetFeatureInfo');

  const layers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const hasEnabledLayers = layers.some((layer) => layer.enabled);

  // Box-select is a conscious opt-in (HistogramPanel's button), not turned
  // on just by viewing the Histogram subtab - but it must not stay active
  // once the user has navigated away from it, whether by switching subtabs
  // or by switching to an entirely different main tab (this panel stays
  // mounted either way, so neither case unmounts it on its own).
  React.useEffect(() => {
    if (!isActive || subTab !== 'Histogram') {
      dispatch(actions.setHistogramBoxSelectActive({ mapId, active: false }));
    }
  }, [mapId, isActive, subTab, dispatch]);

  return (
    <div className="query_panel">
      <div className="query_panel_header">
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {SUB_TABS.map((tab) => (
            <Button
              key={tab}
              size="small"
              variant={subTab === tab ? 'contained' : 'outlined'}
              onClick={() => setSubTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>
        <Typography variant="body2">{subTabInstructions[subTab]}</Typography>
      </div>
      <GetFeatureInfoPanel
        mapId={mapId}
        isShown={subTab === 'GetFeatureInfo'}
      />
      <TimeSeriesPanel mapId={mapId} isShown={subTab === 'TimeSeries'} />
      <HistogramPanel mapId={mapId} isShown={subTab === 'Histogram'} />
      {!hasEnabledLayers && <div>No layers added</div>}
    </div>
  );
};

export default QueryPanel;
