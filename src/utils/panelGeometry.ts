// Where a floating panel (one the user can move and resize, like the layer
// details dialog) sits on screen, in CSS pixels from the viewport's top left.
export interface PanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

// The edge or corner of a panel being dragged to resize it, as compass
// points: 'n' is the top edge, 'se' the bottom right corner.
export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_EDGES: ResizeEdge[] = [
  'n',
  'e',
  's',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
];

export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 200;

// How much of a panel always stays inside the viewport, so there is always
// a piece of its title bar left to drag it back with.
export const PANEL_REACHABLE_MARGIN = 48;

// A panel in the middle of the viewport, taking up the given fraction of it.
export const centeredGeometry = (
  viewport: ViewportSize,
  fraction = 0.8,
): PanelGeometry => {
  const width = Math.round(viewport.width * fraction);
  const height = Math.round(viewport.height * fraction);
  return {
    left: Math.round((viewport.width - width) / 2),
    top: Math.round((viewport.height - height) / 2),
    width,
    height,
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

// Keeps a panel reachable: no larger than the viewport (nor smaller than the
// minimum size), its title bar never above the top of it, and never further
// off to a side or the bottom than PANEL_REACHABLE_MARGIN allows.
export const clampGeometry = (
  geometry: PanelGeometry,
  viewport: ViewportSize,
): PanelGeometry => {
  const width = clamp(geometry.width, MIN_PANEL_WIDTH, viewport.width);
  const height = clamp(geometry.height, MIN_PANEL_HEIGHT, viewport.height);
  return {
    left: clamp(
      geometry.left,
      PANEL_REACHABLE_MARGIN - width,
      viewport.width - PANEL_REACHABLE_MARGIN,
    ),
    top: clamp(geometry.top, 0, viewport.height - PANEL_REACHABLE_MARGIN),
    width,
    height,
  };
};

// The panel after dragging it (dx, dy) pixels from where it started.
export const moveGeometry = (
  start: PanelGeometry,
  dx: number,
  dy: number,
  viewport: ViewportSize,
): PanelGeometry =>
  clampGeometry(
    { ...start, left: start.left + dx, top: start.top + dy },
    viewport,
  );

// The panel after dragging one of its edges or corners (dx, dy) pixels from
// where it started. The opposite edge stays where it is.
export const resizeGeometry = (
  start: PanelGeometry,
  edge: ResizeEdge,
  dx: number,
  dy: number,
): PanelGeometry => {
  let { left, top, width, height } = start;
  if (edge.includes('e')) {
    width = Math.max(MIN_PANEL_WIDTH, start.width + dx);
  }
  if (edge.includes('w')) {
    width = Math.max(MIN_PANEL_WIDTH, start.width - dx);
    left = start.left + start.width - width;
  }
  if (edge.includes('s')) {
    height = Math.max(MIN_PANEL_HEIGHT, start.height + dy);
  }
  if (edge.includes('n')) {
    // The top edge stops at the top of the viewport - the title bar is
    // there, and it has to stay reachable.
    const bottom = start.top + start.height;
    height = Math.min(Math.max(MIN_PANEL_HEIGHT, start.height - dy), bottom);
    top = bottom - height;
  }
  return { left, top, width, height };
};

// Where the user last left a panel, kept in localStorage under the given key
// so it opens there again - also after a reload. Null when nothing (usable)
// was stored: storage may be disabled (private browsing) or the value
// corrupted, and then the panel just opens at its default place.
export const readStoredPanelGeometry = (key: string): PanelGeometry | null => {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { left, top, width, height } = parsed as Record<string, unknown>;
    const values = [left, top, width, height];
    if (!values.every((value) => Number.isFinite(value))) {
      return null;
    }
    return { left, top, width, height } as PanelGeometry;
  } catch {
    return null;
  }
};

export const storePanelGeometry = (
  key: string,
  geometry: PanelGeometry,
): void => {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
      }),
    );
  } catch {
    // Not remembered then - the panel still stays put until it is closed.
  }
};
