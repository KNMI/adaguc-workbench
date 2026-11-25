import {
  centeredGeometry,
  clampGeometry,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  moveGeometry,
  PANEL_REACHABLE_MARGIN,
  readStoredPanelGeometry,
  resizeGeometry,
  storePanelGeometry,
} from './panelGeometry';

const viewport = { width: 1000, height: 800 };
const start = { left: 100, top: 80, width: 600, height: 400 };

describe('centeredGeometry', () => {
  it('centers a panel covering 80% of the viewport by default', () => {
    expect(centeredGeometry(viewport)).toEqual({
      left: 100,
      top: 80,
      width: 800,
      height: 640,
    });
  });

  it('accepts another fraction of the viewport', () => {
    expect(centeredGeometry(viewport, 0.5)).toEqual({
      left: 250,
      top: 200,
      width: 500,
      height: 400,
    });
  });
});

describe('moveGeometry', () => {
  it('moves the panel without changing its size', () => {
    expect(moveGeometry(start, 50, -30, viewport)).toEqual({
      left: 150,
      top: 50,
      width: 600,
      height: 400,
    });
  });

  it('keeps the title bar below the top of the viewport', () => {
    expect(moveGeometry(start, 0, -500, viewport).top).toBe(0);
  });

  it('keeps part of the panel in view when dragged off any other side', () => {
    expect(moveGeometry(start, -5000, 0, viewport).left).toBe(
      PANEL_REACHABLE_MARGIN - start.width,
    );
    expect(moveGeometry(start, 5000, 0, viewport).left).toBe(
      viewport.width - PANEL_REACHABLE_MARGIN,
    );
    expect(moveGeometry(start, 0, 5000, viewport).top).toBe(
      viewport.height - PANEL_REACHABLE_MARGIN,
    );
  });
});

describe('resizeGeometry', () => {
  it('moves the right and bottom edges, leaving the top left in place', () => {
    expect(resizeGeometry(start, 'se', 40, -60)).toEqual({
      left: 100,
      top: 80,
      width: 640,
      height: 340,
    });
  });

  it('moves the left and top edges, leaving the bottom right in place', () => {
    expect(resizeGeometry(start, 'nw', 40, -60)).toEqual({
      left: 140,
      top: 20,
      width: 560,
      height: 460,
    });
  });

  it('only changes the dragged side for a single edge', () => {
    expect(resizeGeometry(start, 'e', 40, 999)).toEqual({
      ...start,
      width: 640,
    });
    expect(resizeGeometry(start, 's', 999, 40)).toEqual({
      ...start,
      height: 440,
    });
  });

  it('does not shrink below the minimum size', () => {
    expect(resizeGeometry(start, 'se', -5000, -5000)).toEqual({
      left: 100,
      top: 80,
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    });
    // Shrinking from the top left keeps the bottom right corner in place.
    expect(resizeGeometry(start, 'nw', 5000, 5000)).toEqual({
      left: 100 + 600 - MIN_PANEL_WIDTH,
      top: 80 + 400 - MIN_PANEL_HEIGHT,
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    });
  });

  it('stops the top edge at the top of the viewport', () => {
    expect(resizeGeometry(start, 'n', 0, -500)).toEqual({
      left: 100,
      top: 0,
      width: 600,
      height: 480,
    });
  });
});

describe('clampGeometry', () => {
  it('leaves a panel that is in view as it is', () => {
    expect(clampGeometry(start, viewport)).toEqual(start);
  });

  it('shrinks and moves a panel back into a viewport that got smaller', () => {
    expect(
      clampGeometry(
        { left: 900, top: 700, width: 800, height: 640 },
        { width: 500, height: 400 },
      ),
    ).toEqual({
      left: 500 - PANEL_REACHABLE_MARGIN,
      top: 400 - PANEL_REACHABLE_MARGIN,
      width: 500,
      height: 400,
    });
  });

  it('grows a panel that is smaller than the minimum size', () => {
    expect(
      clampGeometry({ left: 10, top: 10, width: 5, height: 5 }, viewport),
    ).toEqual({
      left: 10,
      top: 10,
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    });
  });
});

describe('stored panel geometry', () => {
  const key = 'test_panel_geometry';

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads back what was stored', () => {
    storePanelGeometry(key, start);

    expect(readStoredPanelGeometry(key)).toEqual(start);
  });

  it('keeps panels under different keys apart', () => {
    storePanelGeometry(key, start);

    expect(readStoredPanelGeometry('another_panel')).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(readStoredPanelGeometry(key)).toBeNull();
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['something other than an object', '42'],
    ['a missing side', JSON.stringify({ left: 1, top: 2, width: 3 })],
    [
      'a side that is not a number',
      JSON.stringify({ left: 1, top: 2, width: 3, height: 'tall' }),
    ],
    [
      'a side that is not finite',
      JSON.stringify({ left: 1, top: 2, width: 3, height: null }),
    ],
  ])('returns null for %s', (_description, stored) => {
    window.localStorage.setItem(key, stored);

    expect(readStoredPanelGeometry(key)).toBeNull();
  });

  it('carries on when storage is not available', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });

    expect(() => {
      storePanelGeometry(key, start);
    }).not.toThrow();
    expect(readStoredPanelGeometry(key)).toBeNull();
  });
});
