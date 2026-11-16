import * as React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { AdagucPendingLayer } from '../../store/types';
import { getDatasetNameFromServiceUrl } from '../../utils/getDatasetNameFromServiceUrl';

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

// Stands in for a layer that is still being added (its service's
// capabilities are being fetched) - in the same frame and title strip as a
// layer card, so the real card takes its place when it's ready.
export const PendingLayerCard = ({
  pendingLayer,
}: {
  pendingLayer: AdagucPendingLayer;
}): React.ReactElement => {
  const { name, serviceUrl } = pendingLayer;
  const datasetName = getDatasetNameFromServiceUrl(serviceUrl);
  const label = name ? `Loading layer ${name}` : 'Loading layer';

  return (
    <Card
      className="layercomponent_item"
      elevation={0}
      role="status"
      aria-label={label}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      <CardHeader
        title={<Box sx={ellipsis}>{name ? `Layer ${name}` : 'New layer'}</Box>}
        subheader={
          <>
            {datasetName && (
              <Box sx={ellipsis}>
                Dataset: <code>{datasetName}</code>
              </Box>
            )}
            <Box sx={ellipsis}>
              <code>{serviceUrl}</code>
            </Box>
          </>
        }
        slotProps={{
          title: { sx: { minWidth: 0, fontSize: '0.95rem', fontWeight: 600 } },
          subheader: { sx: { fontSize: '0.8rem', minWidth: 0 } },
          content: { sx: { minWidth: 0 } },
        }}
        sx={{
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          py: 1,
        }}
      />
      <LinearProgress />
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="body2" color="text.secondary">
          Loading its capabilities from the service…
        </Typography>
      </CardContent>
    </Card>
  );
};
