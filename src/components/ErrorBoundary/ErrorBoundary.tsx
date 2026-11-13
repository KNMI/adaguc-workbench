import * as React from 'react';
import { Card, IconButton, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  // Short label shown in the fallback, e.g. "Layer unavailable".
  fallbackMessage: string;
  // defaultProps can't satisfy both react/static-property-placement and TS
  // for an optional prop on a class component, so these are left optional
  // without one and defaulted at the point of use instead.
  onError?: (error: Error) => void;
  // Extra style merged onto the fallback card, e.g. to float it in a
  // corner when the surrounding layout has no normal flow for it (such as
  // inside the map view, where children are rendered over the OL canvas).
  fallbackStyle?: React.CSSProperties;
  // Shows a remove button in the fallback itself when given - the whole
  // point of catching the error here is that the broken layer's own UI
  // (including its normal remove button) never renders at all, which
  // otherwise leaves no way to get rid of it again except reloading the
  // whole page and hoping it doesn't come back from a saved permalink.
  onRemove?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches render errors thrown by its children so a single broken piece
// (e.g. one misconfigured layer) can't blank out the rest of the app.
// Give it a `key` that changes with whatever might cause the error (e.g.
// a layer id) so a retry with different input gets a fresh mount instead
// of staying stuck in the caught state.
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    const { onError } = this.props;
    onError?.(error);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallbackMessage, fallbackStyle, onRemove } = this.props;

    if (error) {
      return (
        <Card
          className="layercomponent_item"
          style={{
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            ...fallbackStyle,
          }}
        >
          <Tooltip title={error.message}>
            <WarningAmberIcon fontSize="small" sx={{ color: 'grey.500' }} />
          </Tooltip>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flexGrow: 1, minWidth: 0 }}
          >
            {fallbackMessage}
          </Typography>
          {onRemove && (
            <Tooltip title="Remove this layer">
              <IconButton
                size="small"
                aria-label="Remove layer"
                onClick={onRemove}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Card>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
