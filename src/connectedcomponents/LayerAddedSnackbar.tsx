import * as React from 'react';
import { Snackbar } from '@mui/material';
import { useAppSelector } from '../store/store';
import { AdagucLayerAddedNotice, ViewerState } from '../store/types';

const messageFor = (notice: AdagucLayerAddedNotice): string => {
  const layer = notice.layerTitle ?? notice.layerName;
  return notice.hasError
    ? `Added layer ${layer}, but its service could not be read ⚠️`
    : `Added layer ${layer} ✅`;
};

// Confirms a layer the user just added (from AutoWMS, the service field or
// the Add data dialog), like the copy buttons confirm a copy.
const LayerAddedSnackbar = (): React.ReactElement => {
  const notice = useAppSelector(
    (state: ViewerState) => state.viewer.layerAddedNotice,
  );
  // Each notice shows once, until closed or timed out.
  const [closedRequestId, setClosedRequestId] = React.useState<string>();

  return (
    <Snackbar
      open={!!notice && notice.requestId !== closedRequestId}
      autoHideDuration={3000}
      onClose={() => {
        setClosedRequestId(notice?.requestId);
      }}
      message={notice ? messageFor(notice) : ''}
    />
  );
};

export default LayerAddedSnackbar;
