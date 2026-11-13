import * as React from 'react';
import { IconButton, Tooltip, Typography } from '@mui/material';
import { ArrowBackIos, ArrowForwardIos } from '@mui/icons-material';
import { awbColors } from '../application/appTheme';
import { SortableLayerList } from './SortableLayerList';

export interface LayerPanelProps {
  mapId: string;
  isExpanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
}

// The left-hand panel: the map's layers, under a header that collapses the
// whole panel into a narrow strip (see AdagucMosaic for its width) - the
// counterpart of the tool panel on the right (see SideToolPanel).
const LayerPanel = ({
  mapId,
  isExpanded,
  onToggleExpanded,
}: LayerPanelProps): React.ReactElement => {
  const label = isExpanded ? 'Collapse layer panel' : 'Expand layer panel';
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minHeight: '40px',
          background: awbColors.water,
        }}
      >
        <Tooltip title={label}>
          <IconButton
            size="small"
            color="inherit"
            aria-label={label}
            aria-expanded={isExpanded}
            onClick={() => {
              onToggleExpanded(!isExpanded);
            }}
          >
            {/* Pointing the way the panel will move. */}
            {isExpanded ? <ArrowBackIos /> : <ArrowForwardIos />}
          </IconButton>
        </Tooltip>
        {isExpanded && (
          <Typography variant="subtitle2" component="h2">
            Layers
          </Typography>
        )}
      </div>
      {/* Hidden rather than unmounted while collapsed, so nothing in it
          (e.g. an open layer details dialog) starts over on expanding. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: isExpanded ? 'block' : 'none',
        }}
      >
        <SortableLayerList mapId={mapId} />
      </div>
    </div>
  );
};

export default LayerPanel;
