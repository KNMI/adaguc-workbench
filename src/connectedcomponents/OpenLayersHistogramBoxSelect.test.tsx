import type { Mock } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import DragPan from 'ol/interaction/DragPan';
import { MapContext } from '@opengeoweb/webmap-react';
import OpenLayersHistogramBoxSelect from './OpenLayersHistogramBoxSelect';

vi.mock('@opengeoweb/webmap-react', async () => {
  const ReactLib = await import('react');
  return {
    MapContext: ReactLib.createContext({ map: null }),
  };
});

vi.mock('ol/interaction/DragPan', () => ({
  default: class DragPanMock {
    setActive = vi.fn();
  },
}));

vi.mock('ol/events/condition', () => ({
  always: vi.fn(),
}));

vi.mock('ol/Observable', () => ({
  unByKey: vi.fn(),
}));

let capturedBoxEndHandler: (() => void) | undefined;
const mockDragBoxOn = vi.fn((event: string, handler: () => void) => {
  if (event === 'boxend') {
    capturedBoxEndHandler = handler;
  }
  return {};
});
const mockDragBoxGetExtent = vi.fn(() => [10, 20, 30, 40]);
vi.mock('ol/interaction/DragBox', () => ({
  default: vi.fn(function DragBoxMock() {
    return {
      on: mockDragBoxOn,
      getGeometry: () => ({ getExtent: mockDragBoxGetExtent }),
    };
  }),
}));

// Pixel coordinates for the extent's bottom-left/top-right corners - chosen
// so the resulting box is a non-square 190x959, to confirm width and height
// aren't mixed up with each other.
const mockGetPixelFromCoordinate = vi.fn((coordinate: number[]) =>
  coordinate[0] === 10 ? [100, 1000] : [290, 41],
);

const makeFakeMap = () => {
  const dragPanInteraction = new DragPan() as unknown as {
    setActive: Mock;
  };
  const addInteraction = vi.fn();
  const removeInteraction = vi.fn();
  return {
    dragPanInteraction,
    addInteraction,
    removeInteraction,
    map: {
      getInteractions: () => ({
        getArray: () => [dragPanInteraction],
      }),
      addInteraction,
      removeInteraction,
      getView: () => ({
        getProjection: () => ({ getCode: () => 'EPSG:3857' }),
      }),
      getPixelFromCoordinate: mockGetPixelFromCoordinate,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
};

describe('OpenLayersHistogramBoxSelect', () => {
  afterEach(() => {
    vi.clearAllMocks();
    capturedBoxEndHandler = undefined;
  });

  it('does nothing when inactive', () => {
    const { map, addInteraction, dragPanInteraction } = makeFakeMap();

    render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active={false} onBoxSelected={vi.fn()} />
      </MapContext.Provider>,
    );

    expect(addInteraction).not.toHaveBeenCalled();
    expect(dragPanInteraction.setActive).not.toHaveBeenCalled();
  });

  it('suspends panning and adds a DragBox interaction while active', () => {
    const { map, addInteraction, dragPanInteraction } = makeFakeMap();

    render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active onBoxSelected={vi.fn()} />
      </MapContext.Provider>,
    );

    expect(dragPanInteraction.setActive).toHaveBeenCalledWith(false);
    expect(addInteraction).toHaveBeenCalledTimes(1);
  });

  it('reports the drawn box extent, current srs, and the box own pixel size on boxend', () => {
    const { map } = makeFakeMap();
    const onBoxSelected = vi.fn();

    render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active onBoxSelected={onBoxSelected} />
      </MapContext.Provider>,
    );

    expect(capturedBoxEndHandler).toBeDefined();
    capturedBoxEndHandler?.();

    expect(onBoxSelected).toHaveBeenCalledWith(
      { left: 10, bottom: 20, right: 30, top: 40 },
      'EPSG:3857',
      { width: 190, height: 959 },
    );
  });

  it('restores panning and removes the interaction when deactivated', () => {
    const { map, removeInteraction, dragPanInteraction } = makeFakeMap();

    const { rerender } = render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active onBoxSelected={vi.fn()} />
      </MapContext.Provider>,
    );
    dragPanInteraction.setActive.mockClear();

    rerender(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active={false} onBoxSelected={vi.fn()} />
      </MapContext.Provider>,
    );

    expect(removeInteraction).toHaveBeenCalledTimes(1);
    expect(dragPanInteraction.setActive).toHaveBeenCalledWith(true);
  });
});
