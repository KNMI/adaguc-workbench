import * as React from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { get as getOlProjection } from 'ol/proj';
import { actions, useAppDispatch } from '../store/store';
import { MAP_ID } from '../store/mapId';
import {
  PredefinedArea,
  getPredefinedAreaThumbnailUrl,
  predefinedAreas,
} from '../utils/predefinedAreas';
import { registerExtraProjections } from '../utils/registerExtraProjections';

export interface PredefinedAreasDialogProps {
  isDialogOpen: boolean;
  onDialogOpen: (open: boolean) => void;
}

// Runs once, as soon as this module loads (AdagucAppBar always mounts this
// dialog), well before the user can click any preset.
registerExtraProjections();

// Ported from adaguc-viewer's MapTypeSelector panel: a grid of preset
// srs/bbox combinations (see utils/predefinedAreas.ts) the user can jump
// the map straight to, instead of manually picking a projection and area.
const PredefinedAreasDialog = ({
  isDialogOpen,
  onDialogOpen,
}: PredefinedAreasDialogProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const mapId = MAP_ID;

  const handleSelectArea = (area: PredefinedArea): void => {
    dispatch(
      actions.requestSetProjection({
        mapId,
        srs: area.srs,
        bbox: area.bbox,
      }),
    );
    onDialogOpen(false);
  };

  return (
    <Dialog
      open={isDialogOpen}
      onClose={() => {
        onDialogOpen(false);
      }}
      maxWidth={false}
      // No fixed height - with 11 presets, 40vh was forcing a scrollbar on
      // most screens. Growing to fit the content (capped at 80vh so it
      // still fits on small screens) shows every tile at once instead.
      slotProps={{
        paper: { sx: { width: '70vw', maxWidth: '70vw', maxHeight: '80vh' } },
      }}
    >
      <DialogTitle>Predefined areas</DialogTitle>
      <IconButton
        aria-label="close"
        onClick={() => {
          onDialogOpen(false);
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
      <DialogContent sx={{ overflow: 'auto' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {predefinedAreas.map((area) => {
            // OpenLayers can only build a View for an srs proj4 actually
            // has a definition for (see registerExtraProjections) -
            // without one, ol/proj's get() returns null, and View
            // construction throws trying to read its extent. Rather than
            // crash on click, disable whichever preset that's still true
            // for (this self-heals the moment a definition is added).
            const isAvailable = getOlProjection(area.srs) !== null;
            const tile = (
              <Box
                key={area.title}
                role="button"
                tabIndex={isAvailable ? 0 : -1}
                aria-label={area.title}
                aria-disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) {
                    handleSelectArea(area);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    isAvailable &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    handleSelectArea(area);
                  }
                }}
                sx={{
                  width: 130,
                  p: 1,
                  textAlign: 'center',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  opacity: isAvailable ? 1 : 0.4,
                  borderRadius: 1,
                  '&:hover': isAvailable
                    ? { bgcolor: 'action.hover' }
                    : undefined,
                }}
              >
                <Box
                  component="img"
                  src={getPredefinedAreaThumbnailUrl(area)}
                  alt={area.title}
                  sx={{
                    width: 110,
                    height: 80,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'common.white',
                  }}
                />
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {area.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {area.srs}
                </Typography>
              </Box>
            );
            return isAvailable ? (
              tile
            ) : (
              <Tooltip
                key={area.title}
                title={`${area.srs} isn't available in this viewer yet`}
              >
                <span>{tile}</span>
              </Tooltip>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default PredefinedAreasDialog;
