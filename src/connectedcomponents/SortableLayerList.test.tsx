import * as React from 'react';
import { ReactSortable } from 'react-sortablejs';
import { emptyMap, renderWithStore } from '../testUtils/renderWithStore';
import { SortableLayerList } from './SortableLayerList';

// react-sortablejs pulls in real SortableJS drag physics that jsdom can't
// exercise meaningfully - this only needs to capture the props
// SortableLayerList passes it, not actually simulate a drag.
vi.mock('react-sortablejs', () => ({
  ReactSortable: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any): React.ReactNode => props.children as React.ReactNode,
  ),
}));

vi.mock('./ReduxLayerComponent', () => ({
  ReduxLayerComponent: () => null,
}));

vi.mock('./LayerDetailsComponent/LayerDetailDialog', () => ({
  default: () => null,
}));

const mapId = 'map1';

describe('SortableLayerList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('restricts drag-to-reorder to non-interactive areas of a layer card', () => {
    // Regression guard: without this, SortableJS treats a mousedown
    // anywhere in a layer card - including dragging a dimension/opacity
    // slider's thumb - as the start of a reorder-drag of the whole card
    // (confirmed live: dragging a time slider made the card gain
    // SortableJS's own "sortable-chosen" class and become draggable).
    const mockReactSortable = vi.mocked(ReactSortable);

    renderWithStore(<SortableLayerList mapId={mapId} />, {
      [mapId]: emptyMap(),
    });

    const [props] = mockReactSortable.mock.calls[0];
    expect(props).toEqual(
      expect.objectContaining({
        filter: "input, button, [role='button'], .MuiSlider-root",
        preventOnFilter: false,
      }),
    );
  });
});
