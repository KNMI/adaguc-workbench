import * as React from 'react';
import { awbColors } from '../../application/appTheme';
import { Popper, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { WMLayer } from '@opengeoweb/webmap';
import WCSPanel from './WCSPanel';

export interface WCSPanelDialogProps {
  mapId: string;
  wmLayer: WMLayer | null;
  isOpen: boolean;
  onClose: () => void;
}

// A popup for the WCS panel, styled the same way as AutoWMSLayerDetailsDialog
// (centered, bordered, scrollable) - opened from the Layer Settings panel.
const WCSPanelDialog = ({
  mapId,
  wmLayer,
  isOpen,
  onClose,
}: WCSPanelDialogProps): React.ReactElement => {
  return (
    <Popper
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2000,
        background: awbColors.surface,
        border: `1px solid ${awbColors.waterDark}`,
        height: '90vh',
        width: '90vw',
        overflow: 'auto',
      }}
      open={isOpen}
    >
      <DialogTitle>WCS - {wmLayer?.title ?? wmLayer?.name}</DialogTitle>
      <IconButton
        aria-label="close"
        onClick={onClose}
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          color: (theme) => theme.palette.grey[500],
        }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent>
        {isOpen && wmLayer && <WCSPanel mapId={mapId} wmLayer={wmLayer} />}
      </DialogContent>
    </Popper>
  );
};

export default WCSPanelDialog;
