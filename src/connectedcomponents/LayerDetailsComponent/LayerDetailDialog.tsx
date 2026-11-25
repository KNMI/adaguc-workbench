import * as React from 'react';
import { awbColors } from '../../application/appTheme';
import {
  Box,
  Popper,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { getWMLayer } from '../../utils/getWMLayer';
import {
  centeredGeometry,
  clampGeometry,
  moveGeometry,
  PanelGeometry,
  readStoredPanelGeometry,
  RESIZE_EDGES,
  ResizeEdge,
  resizeGeometry,
  storePanelGeometry,
  ViewportSize,
} from '../../utils/panelGeometry';
import LayerDetailsComponent from './LayerDetailsComponent';

interface LayerDetailDialogProps {
  mapId: string;
  isDialogOpen: boolean;
  layerId: string;
  onClose: () => void;
}

// Where the user last left the dialog is remembered under this key.
const STORAGE_KEY = 'adaguc_layer_details_dialog_geometry';

// A move (edge: null) or resize of the dialog in progress: where the pointer
// and the dialog were when it started, and where the dialog is by now (null
// until the pointer has moved).
interface DragGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startGeometry: PanelGeometry;
  latestGeometry: PanelGeometry | null;
  edge: ResizeEdge | null;
}

const getViewport = (): ViewportSize => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

// The strips along the dialog's border that resize it when dragged. They
// stick out as far as they reach in, so the border itself is easy to grab.
const RESIZE_HANDLE_SIZE = 8;
const RESIZE_CORNER_SIZE = 16;

// The grips drawn on those strips to show they can be dragged: a short bar
// in the middle of each edge, and an L around each corner.
const GRIP_BAR_LENGTH = 36;
const GRIP_BAR_THICKNESS = 4;
const GRIP_CORNER_LENGTH = 10;
const GRIP_CORNER_THICKNESS = 3;

const resizeHandleStyle = (edge: ResizeEdge): React.CSSProperties => {
  const isCorner = edge.length === 2;
  const size = isCorner ? RESIZE_CORNER_SIZE : RESIZE_HANDLE_SIZE;
  const offset = -size / 2;
  const style: React.CSSProperties = {
    position: 'absolute',
    touchAction: 'none',
    // 'n' and 's' resize vertically, 'ne'/'sw' and 'nw'/'se' diagonally.
    cursor: `${edge}-resize`,
    zIndex: isCorner ? 2 : 1,
  };
  if (edge.includes('n')) {
    style.top = offset;
    style.height = size;
  }
  if (edge.includes('s')) {
    style.bottom = offset;
    style.height = size;
  }
  if (edge.includes('w')) {
    style.left = offset;
    style.width = size;
  }
  if (edge.includes('e')) {
    style.right = offset;
    style.width = size;
  }
  if (edge === 'n' || edge === 's') {
    style.left = 0;
    style.right = 0;
  }
  if (edge === 'e' || edge === 'w') {
    style.top = 0;
    style.bottom = 0;
  }
  return style;
};

// The grip takes its handle's text colour, which changes on hover.
const resizeGripStyle = (edge: ResizeEdge): React.CSSProperties => {
  if (edge.length === 1) {
    const isHorizontal = edge === 'n' || edge === 's';
    return {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: isHorizontal ? GRIP_BAR_LENGTH : GRIP_BAR_THICKNESS,
      height: isHorizontal ? GRIP_BAR_THICKNESS : GRIP_BAR_LENGTH,
      borderRadius: GRIP_BAR_THICKNESS / 2,
      background: 'currentColor',
    };
  }
  // An L along the corner's two outer sides, starting from the handle's
  // inner corner so that it wraps around the dialog's own corner.
  const border = `${GRIP_CORNER_THICKNESS}px solid currentColor`;
  const style: React.CSSProperties = {
    position: 'absolute',
    boxSizing: 'border-box',
    width: GRIP_CORNER_LENGTH,
    height: GRIP_CORNER_LENGTH,
  };
  if (edge.includes('n')) {
    style.bottom = 0;
    style.borderTop = border;
  } else {
    style.top = 0;
    style.borderBottom = border;
  }
  if (edge.includes('w')) {
    style.right = 0;
    style.borderLeft = border;
  } else {
    style.left = 0;
    style.borderRight = border;
  }
  return style;
};

// The layer details (projections, WMS details, ncdump, color range) in a
// floating panel. It doesn't block the map: drag its title bar to move it
// and its edges or corners to resize it, so it can stay open next to the
// map while trying out projections. Where it was left is remembered, so it
// opens there again the next time.
const LayerDetailDialog = ({
  mapId,
  isDialogOpen,
  layerId,
  onClose,
}: LayerDetailDialogProps): React.ReactElement => {
  const wmLayer = getWMLayer(layerId);
  const [geometry, setGeometry] = React.useState<PanelGeometry>(() => {
    const viewport = getViewport();
    const stored = readStoredPanelGeometry(STORAGE_KEY);
    // The window may be smaller now than when the dialog was last used.
    return stored
      ? clampGeometry(stored, viewport)
      : centeredGeometry(viewport);
  });
  const gesture = React.useRef<DragGesture | null>(null);

  // A browser window that gets smaller must not leave the dialog out of
  // reach. This is not remembered: it isn't where the user put the dialog.
  React.useEffect(() => {
    const onWindowResize = (): void => {
      setGeometry((current) => clampGeometry(current, getViewport()));
    };
    window.addEventListener('resize', onWindowResize);
    return (): void => {
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  const startGesture = (
    event: React.PointerEvent<HTMLElement>,
    edge: ResizeEdge | null,
  ): void => {
    if (event.button !== 0) {
      return;
    }
    // No text selection while dragging.
    event.preventDefault();
    // Keeps the pointer's events coming to this element, also once it is
    // dragged off it (jsdom, in the tests, has no pointer capture).
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startGeometry: geometry,
      latestGeometry: null,
      edge,
    };
  };

  const continueGesture = (event: React.PointerEvent<HTMLElement>): void => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const next =
      current.edge === null
        ? moveGeometry(current.startGeometry, dx, dy, getViewport())
        : resizeGeometry(current.startGeometry, current.edge, dx, dy);
    current.latestGeometry = next;
    setGeometry(next);
  };

  const endGesture = (): void => {
    const finished = gesture.current;
    gesture.current = null;
    if (finished?.latestGeometry) {
      storePanelGeometry(STORAGE_KEY, finished.latestGeometry);
    }
  };

  return (
    <Popper
      data-testid="layer-detail-dialog"
      style={{
        position: 'fixed',
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
        zIndex: 2000,
        background: awbColors.surface,
        border: `1px solid ${awbColors.waterDark}`,
        display: 'flex',
        flexDirection: 'column',
      }}
      open={isDialogOpen}
    >
      <DialogTitle
        data-testid="layer-detail-dialog-title"
        onPointerDown={(event) => {
          startGesture(event, null);
        }}
        onPointerMove={continueGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        sx={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'move',
          userSelect: 'none',
          touchAction: 'none',
          paddingLeft: 1.5,
          // Room for the close button.
          paddingRight: 7,
          whiteSpace: 'nowrap',
        }}
      >
        {/* Shows that the title bar is what moves the dialog. */}
        <DragIndicatorIcon
          fontSize="small"
          sx={{ flex: '0 0 auto', color: awbColors.accentLight }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Layer details for {wmLayer?.name}
        </span>
      </DialogTitle>
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
      <DialogContent sx={{ minHeight: 0, overflow: 'auto' }}>
        <LayerDetailsComponent mapId={mapId} layerId={layerId} />
      </DialogContent>
      {RESIZE_EDGES.map((edge) => (
        <Box
          key={edge}
          data-testid={`layer-detail-dialog-resize-${edge}`}
          style={resizeHandleStyle(edge)}
          sx={{
            color: awbColors.accentLight,
            '&:hover, &:active': { color: awbColors.accent },
          }}
          onPointerDown={(event) => {
            startGesture(event, edge);
          }}
          onPointerMove={continueGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <div
            data-testid={`layer-detail-dialog-grip-${edge}`}
            style={resizeGripStyle(edge)}
          />
        </Box>
      ))}
    </Popper>
  );
};
export default LayerDetailDialog;
