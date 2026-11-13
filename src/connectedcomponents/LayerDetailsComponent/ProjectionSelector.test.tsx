import * as React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import type { WMLayer } from '@opengeoweb/webmap';
import { emptyMap, renderWithStore } from '../../testUtils/renderWithStore';
import ProjectionSelector from './ProjectionSelector';

const mapId = 'map1';

const wmLayer = {
  id: 'layer-1',
  projectionProperties: [
    {
      srs: 'EPSG:4326',
      bbox: { left: -180, bottom: -90, right: 180, top: 90 },
    },
    {
      srs: 'EPSG:3857',
      bbox: { left: -2e7, bottom: -2e7, right: 2e7, top: 2e7 },
    },
  ],
} as unknown as WMLayer;

// The real store and the real OpenLayers projection list: EPSG:4326 and
// EPSG:3857 are built into OpenLayers, and the map starts out in 3857.
const renderSelector = (layer: WMLayer = wmLayer) =>
  renderWithStore(<ProjectionSelector mapId={mapId} wmLayer={layer} />, {
    [mapId]: emptyMap(),
  });

describe('ProjectionSelector', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the header cells inside a table row, without a DOM nesting error', () => {
    // Regression guard: the <th> cells used to sit directly inside <thead>
    // with no <tr> around them - invalid table markup, which React reports
    // as a console error every time the Layer settings dialog opens.
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    renderSelector();

    const [headerRow] = screen.getAllByRole('row');
    expect(
      within(headerRow)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['CRS', 'Name', 'Left', 'Bottom', 'Right', 'Top']);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lists projections sorted by SRS and switches the map to one when its row is clicked', () => {
    const { store } = renderSelector();

    const [, firstRow, secondRow] = screen.getAllByRole('row');
    expect(within(firstRow).getByText('EPSG:3857')).toBeInTheDocument();
    expect(within(firstRow).getByText(/Pseudo-Mercator/)).toBeInTheDocument();
    expect(firstRow).toHaveClass('selected');
    expect(within(secondRow).getByText('EPSG:4326')).toBeInTheDocument();

    fireEvent.click(secondRow);

    expect(store.getState().viewer.maps[mapId].viewCommand).toMatchObject({
      srs: 'EPSG:4326',
      bbox: { left: -180, bottom: -90, right: 180, top: 90 },
    });
  });

  it('shows an srs the viewer has no projection for, but does not switch to it on click', () => {
    // Regression guard: switching the map to an srs OpenLayers doesn't know
    // (e.g. one only this layer's server advertises) used to crash the
    // whole app in makeView ("Cannot read properties of null (reading
    // 'getExtent')").
    const layerWithUnknownSrs = {
      id: 'layer-2',
      projectionProperties: [
        {
          srs: 'EPSG:9999',
          bbox: { left: 0, bottom: 0, right: 1, top: 1 },
        },
      ],
    } as unknown as WMLayer;
    const { store } = renderSelector(layerWithUnknownSrs);

    const [, row] = screen.getAllByRole('row');
    expect(within(row).getByText('EPSG:9999')).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveClass('unavailable');

    fireEvent.click(row);

    expect(store.getState().viewer.maps[mapId].viewCommand).toBeUndefined();
  });
});
