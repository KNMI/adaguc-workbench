import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { WMLayer } from '@opengeoweb/webmap';
import { get as getOlProjection } from 'ol/proj';
import ProjectionSelector from './ProjectionSelector';

const mockDispatch = jest.fn();
// The real store pulls in @opengeoweb/webmap, an ESM-only package Jest
// can't parse as-is - not what these tests are about, so it's stubbed.
jest.mock('../../store/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: jest.fn(() => ({ srs: 'EPSG:3857' })),
  actions: {
    requestSetProjection: (payload: unknown) => ({
      type: 'requestSetProjection',
      payload,
    }),
  },
}));

// ol is ESM-only too. Only the srs's listed here count as ones OpenLayers
// has a proj4 definition for.
const mockKnownSrs = new Set(['EPSG:4326', 'EPSG:3857']);
jest.mock('ol/proj', () => ({
  get: jest.fn((srs: string) => (mockKnownSrs.has(srs) ? {} : null)),
}));
const mockGetOlProjection = jest.mocked(getOlProjection);

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

describe('ProjectionSelector', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockDispatch.mockClear();
    mockGetOlProjection.mockClear();
  });

  it('renders the header cells inside a table row, without a DOM nesting error', () => {
    // Regression guard: the <th> cells used to sit directly inside <thead>
    // with no <tr> around them - invalid table markup, which React reports
    // as a console error every time the Layer settings dialog opens.
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    render(<ProjectionSelector mapId="map1" wmLayer={wmLayer} />);

    const [headerRow] = screen.getAllByRole('row');
    expect(
      within(headerRow)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['CRS', 'Name', 'Left', 'Bottom', 'Right', 'Top']);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lists projections sorted by SRS and selects one when its row is clicked', () => {
    render(<ProjectionSelector mapId="map1" wmLayer={wmLayer} />);

    const [, firstRow, secondRow] = screen.getAllByRole('row');
    expect(within(firstRow).getByText('EPSG:3857')).toBeInTheDocument();
    expect(firstRow).toHaveClass('selected');
    expect(within(secondRow).getByText('EPSG:4326')).toBeInTheDocument();

    fireEvent.click(secondRow);

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'requestSetProjection',
      payload: {
        mapId: 'map1',
        srs: 'EPSG:4326',
        bbox: { left: -180, bottom: -90, right: 180, top: 90 },
      },
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

    render(<ProjectionSelector mapId="map1" wmLayer={layerWithUnknownSrs} />);

    const [, row] = screen.getAllByRole('row');
    expect(within(row).getByText('EPSG:9999')).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveClass('unavailable');

    fireEvent.click(row);

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
