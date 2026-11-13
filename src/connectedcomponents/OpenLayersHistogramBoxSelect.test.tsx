import * as React from 'react';
import { render } from '@testing-library/react';
import DragPan from 'ol/interaction/DragPan';
import { MapContext } from '@opengeoweb/webmap-react';
import OpenLayersHistogramBoxSelect from './OpenLayersHistogramBoxSelect';

jest.mock('@opengeoweb/webmap-react', () => {
  /* eslint-disable
     @typescript-eslint/no-unsafe-call */
  const ReactLib = require('react');
  return {
    MapContext: ReactLib.createContext({ map: null }),
  };
  /* eslint-enable
     @typescript-eslint/no-unsafe-call */
});

jest.mock('ol/interaction/DragPan', () => ({
  __esModule: true,
  default: class DragPanMock {
    setActive = jest.fn();
  },
}));

jest.mock('ol/events/condition', () => ({
  always: jest.fn(),
}));

jest.mock('ol/Observable', () => ({
  unByKey: jest.fn(),
}));

let capturedBoxEndHandler: (() => void) | undefined;
const mockDragBoxOn = jest.fn((event: string, handler: () => void) => {
  if (event === 'boxend') {
    capturedBoxEndHandler = handler;
  }
  return {};
});
const mockDragBoxGetExtent = jest.fn(() => [10, 20, 30, 40]);
jest.mock('ol/interaction/DragBox', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: mockDragBoxOn,
    getGeometry: () => ({ getExtent: mockDragBoxGetExtent }),
  })),
}));

// Pixel coordinates for the extent's bottom-left/top-right corners - chosen
// so the resulting box is a non-square 190x959, to confirm width and height
// aren't mixed up with each other.
const mockGetPixelFromCoordinate = jest.fn((coordinate: number[]) =>
  coordinate[0] === 10 ? [100, 1000] : [290, 41],
);

const makeFakeMap = () => {
  const dragPanInteraction = new DragPan() as unknown as {
    setActive: jest.Mock;
  };
  const addInteraction = jest.fn();
  const removeInteraction = jest.fn();
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
    jest.clearAllMocks();
    capturedBoxEndHandler = undefined;
  });

  it('does nothing when inactive', () => {
    const { map, addInteraction, dragPanInteraction } = makeFakeMap();

    render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect
          active={false}
          onBoxSelected={jest.fn()}
        />
      </MapContext.Provider>,
    );

    expect(addInteraction).not.toHaveBeenCalled();
    expect(dragPanInteraction.setActive).not.toHaveBeenCalled();
  });

  it('suspends panning and adds a DragBox interaction while active', () => {
    const { map, addInteraction, dragPanInteraction } = makeFakeMap();

    render(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect active onBoxSelected={jest.fn()} />
      </MapContext.Provider>,
    );

    expect(dragPanInteraction.setActive).toHaveBeenCalledWith(false);
    expect(addInteraction).toHaveBeenCalledTimes(1);
  });

  it('reports the drawn box extent, current srs, and the box own pixel size on boxend', () => {
    const { map } = makeFakeMap();
    const onBoxSelected = jest.fn();

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
        <OpenLayersHistogramBoxSelect active onBoxSelected={jest.fn()} />
      </MapContext.Provider>,
    );
    dragPanInteraction.setActive.mockClear();

    rerender(
      <MapContext.Provider value={{ map }}>
        <OpenLayersHistogramBoxSelect
          active={false}
          onBoxSelected={jest.fn()}
        />
      </MapContext.Provider>,
    );

    expect(removeInteraction).toHaveBeenCalledTimes(1);
    expect(dragPanInteraction.setActive).toHaveBeenCalledWith(true);
  });
});
