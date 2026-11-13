import * as React from 'react';
import { IconButton, Snackbar, Tooltip } from '@mui/material';
import CopyToClipBoardIcon from '@mui/icons-material/ContentCopy';

export interface CopyButtonProps {
  text: string;
  info: string;
}
export const CopyToClipBoard = ({
  text,
  info = '',
}: CopyButtonProps): React.ReactElement => {
  const [snackBarOpen, setSnackOpen] = React.useState(false);

  const copyTextToClipBoard = (_text: string): void => {
    setTimeout(() => {
      void navigator.clipboard.writeText(_text).then(() => {
        setSnackOpen(true);
      });
    }, 2);
  };
  const message = `Copied ${info || ''} to clipboard \u2705`;
  return (
    <>
      <Snackbar
        open={snackBarOpen}
        autoHideDuration={2000}
        onClose={() => {
          setSnackOpen(false);
        }}
        message={message}
      />
      <span style={{ display: 'inline' }}>
        <Tooltip title={`Copy ${info}`}>
          <IconButton
            aria-label="copy"
            size="small"
            style={{ fontSize: '6px', padding: 0, margin: '0 2px' }}
            onClick={() => {
              copyTextToClipBoard(text);
            }}
          >
            <CopyToClipBoardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </span>
    </>
  );
};
