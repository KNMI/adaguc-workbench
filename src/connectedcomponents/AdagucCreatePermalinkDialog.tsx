import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ShareIcon from '@mui/icons-material/Share';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import TwitterIcon from '@mui/icons-material/Twitter';

import { makePermaLink } from './handleWindowLocationQueryString';
import { CopyToClipBoard } from './CopyToClipBoard';
import { useAppSelector } from '../store/store';
import { ViewerState, AdagucMap } from '../store/types';

const SHARE_TITLE = 'Adaguc Workbench';

interface AdagucCreatePermalinkDialogProps {
  isDialogOpen: boolean;
  onDialogOpen: (open: boolean) => void;
}
const AdagucCreatePermalinkDialog = ({
  isDialogOpen,
  onDialogOpen,
}: AdagucCreatePermalinkDialogProps): React.ReactElement => {
  const map = useAppSelector(
    (state: ViewerState): AdagucMap => state?.viewer?.maps.map1,
  );
  const link = makePermaLink(map);

  // Anchors the fallback share menu (Email/WhatsApp/X) below - only shown
  // on browsers without the native Web Share API, which most desktop
  // browsers (Linux ones especially) still lack, even though it's long
  // been standard on mobile.
  const [shareMenuAnchor, setShareMenuAnchor] =
    React.useState<HTMLElement | null>(null);
  const closeShareMenu = (): void => setShareMenuAnchor(null);

  const handleShareClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (navigator.share) {
      // Opens the OS's own native share sheet (Mail, Messages, social
      // apps, nearby-share, ...) - whatever's actually installed, rather
      // than this app guessing. Rejects with an AbortError when the user
      // just closes the sheet without picking anything, which isn't a
      // real failure worth logging.
      navigator.share({ title: SHARE_TITLE, url: link }).catch((error) => {
        if ((error as DOMException)?.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.error(error);
        }
      });
      return;
    }
    setShareMenuAnchor(event.currentTarget);
  };

  return (
    <Dialog
      open={isDialogOpen}
      onClose={() => {
        onDialogOpen(false);
      }}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>Permalink</DialogTitle>{' '}
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
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: 'center', minWidth: 0 }}
          >
            <CopyToClipBoard info="link" text={link} />
            <Typography
              component="a"
              variant="body2"
              target="_blank"
              rel="noreferrer"
              href={link}
              sx={{ wordBreak: 'break-all' }}
            >
              {link}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Share:
            </Typography>
            <Tooltip title="Share">
              <IconButton
                aria-label="share"
                size="small"
                onClick={handleShareClick}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Menu
          anchorEl={shareMenuAnchor}
          open={!!shareMenuAnchor}
          onClose={closeShareMenu}
        >
          <MenuItem
            component="a"
            href={`mailto:?subject=${encodeURIComponent(
              SHARE_TITLE,
            )}&body=${encodeURIComponent(link)}`}
            onClick={closeShareMenu}
          >
            <ListItemIcon>
              <EmailIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Email</ListItemText>
          </MenuItem>
          <MenuItem
            component="a"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(link)}`}
            onClick={closeShareMenu}
          >
            <ListItemIcon>
              <WhatsAppIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>WhatsApp</ListItemText>
          </MenuItem>
          <MenuItem
            component="a"
            target="_blank"
            rel="noreferrer"
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
              link,
            )}`}
            onClick={closeShareMenu}
          >
            <ListItemIcon>
              <TwitterIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>X (Twitter)</ListItemText>
          </MenuItem>
        </Menu>
      </DialogContent>
    </Dialog>
  );
};
export default AdagucCreatePermalinkDialog;
