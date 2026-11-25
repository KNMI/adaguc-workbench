import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LayerDetailDialog from './LayerDetailDialog';
import {
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  RESIZE_EDGES,
} from '../../utils/panelGeometry';

const STORAGE_KEY = 'adaguc_layer_details_dialog_geometry';

vi.mock('./LayerDetailsComponent', () => ({
  default: () => <div data-testid="layer-details" />,
}));

vi.mock('../../utils/getWMLayer', () => ({
  getWMLayer: () => ({ id: 'layer-1', name: 'air_temperature' }),
}));

const setViewport = (width: number, height: number): void => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
};

const renderDialog = (onClose = vi.fn()): HTMLElement => {
  render(
    <LayerDetailDialog
      mapId="map1"
      isDialogOpen
      layerId="layer-1"
      onClose={onClose}
    />,
  );
  return screen.getByTestId('layer-detail-dialog');
};

const geometryOf = (
  dialog: HTMLElement,
): { left: string; top: string; width: string; height: string } => ({
  left: dialog.style.left,
  top: dialog.style.top,
  width: dialog.style.width,
  height: dialog.style.height,
});

const drag = (
  handle: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void => {
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: from.x,
    clientY: from.y,
  });
  fireEvent.pointerMove(handle, {
    pointerId: 1,
    clientX: to.x,
    clientY: to.y,
  });
  fireEvent.pointerUp(handle, { pointerId: 1 });
};

describe('LayerDetailDialog', () => {
  beforeEach(() => {
    setViewport(1000, 800);
    window.localStorage.clear();
  });

  it('opens centered, showing the layer details and its name', () => {
    const dialog = renderDialog();

    expect(screen.getByTestId('layer-details')).toBeInTheDocument();
    expect(
      screen.getByText('Layer details for air_temperature'),
    ).toBeInTheDocument();
    expect(geometryOf(dialog)).toEqual({
      left: '100px',
      top: '80px',
      width: '800px',
      height: '640px',
    });
  });

  it('moves when its title bar is dragged', () => {
    const dialog = renderDialog();

    drag(
      screen.getByTestId('layer-detail-dialog-title'),
      { x: 300, y: 100 },
      { x: 350, y: 70 },
    );

    expect(geometryOf(dialog)).toEqual({
      left: '150px',
      top: '50px',
      width: '800px',
      height: '640px',
    });
  });

  it('resizes when its bottom right corner is dragged', () => {
    const dialog = renderDialog();

    drag(
      screen.getByTestId('layer-detail-dialog-resize-se'),
      { x: 900, y: 720 },
      { x: 600, y: 420 },
    );

    expect(geometryOf(dialog)).toEqual({
      left: '100px',
      top: '80px',
      width: '500px',
      height: '340px',
    });
  });

  it('resizes from its left edge, keeping the right edge in place', () => {
    const dialog = renderDialog();

    drag(
      screen.getByTestId('layer-detail-dialog-resize-w'),
      { x: 100, y: 400 },
      { x: 400, y: 450 },
    );

    expect(geometryOf(dialog)).toEqual({
      left: '400px',
      top: '80px',
      width: '500px',
      height: '640px',
    });
  });

  it('does not shrink below its minimum size', () => {
    const dialog = renderDialog();

    drag(
      screen.getByTestId('layer-detail-dialog-resize-se'),
      { x: 900, y: 720 },
      { x: 0, y: 0 },
    );

    expect(dialog.style.width).toBe(`${MIN_PANEL_WIDTH}px`);
    expect(dialog.style.height).toBe(`${MIN_PANEL_HEIGHT}px`);
  });

  it('stays where it is once the drag has ended', () => {
    const dialog = renderDialog();
    const title = screen.getByTestId('layer-detail-dialog-title');

    drag(title, { x: 300, y: 100 }, { x: 350, y: 70 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 500, clientY: 500 });

    expect(dialog.style.left).toBe('150px');
    expect(dialog.style.top).toBe('50px');
  });

  it('ignores a drag started with another mouse button', () => {
    const dialog = renderDialog();
    const title = screen.getByTestId('layer-detail-dialog-title');

    fireEvent.pointerDown(title, {
      pointerId: 1,
      button: 2,
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 350, clientY: 70 });

    expect(dialog.style.left).toBe('100px');
  });

  it('comes back into view when the browser window gets smaller', () => {
    const dialog = renderDialog();

    act(() => {
      setViewport(500, 400);
      window.dispatchEvent(new Event('resize'));
    });

    expect(geometryOf(dialog)).toEqual({
      left: '100px',
      top: '80px',
      width: '500px',
      height: '400px',
    });
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderDialog(onClose);

    fireEvent.click(screen.getByLabelText('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a grip on the title bar and on every edge and corner', () => {
    renderDialog();

    expect(
      screen
        .getByTestId('layer-detail-dialog-title')
        .querySelector('[data-testid="DragIndicatorIcon"]'),
    ).toBeInTheDocument();
    RESIZE_EDGES.forEach((edge) => {
      expect(
        screen.getByTestId(`layer-detail-dialog-grip-${edge}`),
      ).toBeInTheDocument();
    });
  });

  it('opens where it was left after being closed', () => {
    const first = render(
      <LayerDetailDialog
        mapId="map1"
        isDialogOpen
        layerId="layer-1"
        onClose={vi.fn()}
      />,
    );
    drag(
      screen.getByTestId('layer-detail-dialog-resize-se'),
      { x: 900, y: 720 },
      { x: 600, y: 420 },
    );
    drag(
      screen.getByTestId('layer-detail-dialog-title'),
      { x: 300, y: 100 },
      { x: 500, y: 300 },
    );
    // Closing the dialog unmounts it (see SortableLayerList).
    first.unmount();

    expect(geometryOf(renderDialog())).toEqual({
      left: '300px',
      top: '280px',
      width: '500px',
      height: '340px',
    });
  });

  it('does not remember anything for a click without a drag', () => {
    renderDialog();
    const title = screen.getByTestId('layer-detail-dialog-title');

    fireEvent.pointerDown(title, {
      pointerId: 1,
      button: 0,
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerUp(title, { pointerId: 1 });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('opens in view when it was left where the window no longer reaches', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ left: 1500, top: 900, width: 600, height: 400 }),
    );

    expect(geometryOf(renderDialog())).toEqual({
      left: '952px',
      top: '752px',
      width: '600px',
      height: '400px',
    });
  });

  it('opens centered when what was remembered is unusable', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"left":"nowhere"}');

    expect(geometryOf(renderDialog())).toEqual({
      left: '100px',
      top: '80px',
      width: '800px',
      height: '640px',
    });
  });

  it('does not remember being squeezed by a smaller browser window', () => {
    const first = render(
      <LayerDetailDialog
        mapId="map1"
        isDialogOpen
        layerId="layer-1"
        onClose={vi.fn()}
      />,
    );
    act(() => {
      setViewport(500, 400);
      window.dispatchEvent(new Event('resize'));
    });
    first.unmount();
    setViewport(1000, 800);

    expect(geometryOf(renderDialog())).toEqual({
      left: '100px',
      top: '80px',
      width: '800px',
      height: '640px',
    });
  });
});
