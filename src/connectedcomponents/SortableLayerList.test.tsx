import * as React from 'react';
import { render } from '@testing-library/react';
import { useAppDispatch, useAppSelector } from '../store/store';
import { ViewerState } from '../store/types';
import { SortableLayerList } from './SortableLayerList';

// react-sortablejs pulls in real SortableJS drag physics that jsdom can't
// exercise meaningfully - this only needs to capture the props
// SortableLayerList passes it, not actually simulate a drag.
jest.mock('react-sortablejs', () => ({
  ReactSortable: jest.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any): React.ReactNode => props.children as React.ReactNode,
  ),
}));

jest.mock('./ReduxLayerComponent', () => ({
  ReduxLayerComponent: () => null,
}));

jest.mock('./LayerDetailsComponent/LayerDetailDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../store/store', () => ({
  actions: {
    setLayerOrderByIds: (payload: unknown) => ({
      type: 'wmsservices/setLayerOrderByIds',
      payload,
    }),
    removeLayer: (payload: unknown) => ({
      type: 'wmsservices/removeLayer',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockUseAppSelector = jest.mocked(useAppSelector);

const mapId = 'map1';

describe('SortableLayerList', () => {
  beforeEach(() => {
    mockUseAppDispatch.mockReturnValue(jest.fn());
    mockUseAppSelector.mockImplementation((selector) =>
      selector({
        viewer: {
          maps: { [mapId]: { layers: [] } },
          services: {},
          baseLayers: [],
        },
      } as unknown as ViewerState),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('restricts drag-to-reorder to non-interactive areas of a layer card', () => {
    // Regression guard: without this, SortableJS treats a mousedown
    // anywhere in a layer card - including dragging a dimension/opacity
    // slider's thumb - as the start of a reorder-drag of the whole card
    // (confirmed live: dragging a time slider made the card gain
    // SortableJS's own "sortable-chosen" class and become draggable).
    const { ReactSortable } = require('react-sortablejs');
    const mockReactSortable = jest.mocked(ReactSortable);

    render(<SortableLayerList mapId={mapId} />);

    const [props] = mockReactSortable.mock.calls[0];
    expect(props).toEqual(
      expect.objectContaining({
        filter: "input, button, [role='button'], .MuiSlider-root",
        preventOnFilter: false,
      }),
    );
  });
});
