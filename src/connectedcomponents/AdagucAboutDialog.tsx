import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GitHubIcon from '@mui/icons-material/GitHub';

const REPO_URL = 'https://github.com/KNMI/adaguc-workbench';
const SERVER_REPO_URL = 'https://github.com/KNMI/adaguc-server';

export interface AdagucAboutDialogProps {
  isDialogOpen: boolean;
  onDialogOpen: (open: boolean) => void;
}

const AdagucAboutDialog = ({
  isDialogOpen,
  onDialogOpen,
}: AdagucAboutDialogProps): React.ReactElement => {
  return (
    <Dialog
      open={isDialogOpen}
      onClose={() => {
        onDialogOpen(false);
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>About Adaguc Workbench</DialogTitle>
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
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body1">
            Adaguc Workbench (AWB) is a browser-based viewer for WMS and WCS
            geospatial data, meant to use with Adaguc-Server WMS services.
            It&apos;s aimed at:
          </Typography>
          <Typography component="ul" variant="body1" sx={{ m: 0, pl: 3 }}>
            <li>
              <strong>Developers</strong> integrating or testing WMS/WCS
              services
            </li>
            <li>
              <strong>Researchers</strong> exploring and visualizing scientific
              datasets
            </li>
            <li>
              <strong>People developing new WMS layers</strong>, who need a
              quick way to add a service and check how a layer renders, its
              styles, dimensions and legend
            </li>
          </Typography>
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <GitHubIcon fontSize="small" />
            {REPO_URL}
          </Link>
          <Link
            href={SERVER_REPO_URL}
            target="_blank"
            rel="noreferrer"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <GitHubIcon fontSize="small" />
            {SERVER_REPO_URL}
          </Link>
          <Typography variant="caption" color="text.secondary">
            Built on {new Date(__BUILD_DATE__).toLocaleString()}
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default AdagucAboutDialog;
