import * as React from 'react';
import { Popper, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getWMLayer } from '../../utils/getWMLayer';
import LayerDetailsComponent from './LayerDetailsComponent';

interface LayerDetailDialogProps {
  mapId: string;
  isDialogOpen: boolean;
  layerId: string;
  onClose: () => void;
}
const LayerDetailDialog = ({
  mapId,
  isDialogOpen,
  layerId,
  onClose,
}: LayerDetailDialogProps): React.ReactElement => {
  const wmLayer = getWMLayer(layerId);

  return (
    <Popper
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2000,
        background: 'white',
        border: '1px solid rgba(0, 0, 0, 0.3)',
        height: '80vh',
        width: '80vw',
        overflow: 'auto',
      }}
      open={isDialogOpen}
    >
      <DialogTitle>Layer details for {wmLayer?.name}</DialogTitle>{' '}
      <IconButton
        aria-label="close"
        onClick={() => {
          onClose();
        }}
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
        <LayerDetailsComponent mapId={mapId} layerId={layerId} />
      </DialogContent>
    </Popper>
  );
};
export default LayerDetailDialog;
