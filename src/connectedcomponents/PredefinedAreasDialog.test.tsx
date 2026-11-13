import * as React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { get as getOlProjection } from 'ol/proj';
import Projection from 'ol/proj/Projection';
import { MAP_ID } from '../store/mapId';
import { emptyMap, renderWithStore } from '../testUtils/renderWithStore';
import PredefinedAreasDialog from './PredefinedAreasDialog';

const fakeProjection = {} as Projection;

vi.mock('ol/proj', () => ({
  get: vi.fn(() => ({})),
}));

const mockGetOlProjection = vi.mocked(getOlProjection);

vi.mock('../utils/registerExtraProjections', () => ({
  registerExtraProjections: vi.fn(),
}));

// Renders the dialog inside a real store holding the app's one map, so a
// picked area ends up as that map's viewCommand.
const renderDialog = (onDialogOpen = vi.fn()) =>
  renderWithStore(
    <PredefinedAreasDialog isDialogOpen onDialogOpen={onDialogOpen} />,
    { [MAP_ID]: emptyMap() },
  );

describe('PredefinedAreasDialog', () => {
  afterEach(() => {
    mockGetOlProjection.mockImplementation(() => fakeProjection);
  });

  it('lists every predefined area as a clickable tile', () => {
    renderDialog();

    expect(
      screen.getByRole('button', { name: 'World WGS84' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Robinson' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Openstreetmap NL' }),
    ).toBeInTheDocument();
  });

  it("shows each tile's srs id under its thumbnail", () => {
    renderDialog();

    expect(screen.getByText('EPSG:54030')).toBeInTheDocument();
    expect(screen.getByText('EPSG:28992')).toBeInTheDocument();
  });

  it("requests the picked area's projection for the map and closes the dialog", () => {
    const onDialogOpen = vi.fn();

    const { store } = renderDialog(onDialogOpen);

    fireEvent.click(screen.getByRole('button', { name: 'Robinson' }));

    expect(store.getState().viewer.maps[MAP_ID].viewCommand).toEqual({
      srs: 'EPSG:54030',
      bbox: {
        left: -17036744.451383516,
        bottom: -10711364.114367772,
        right: 16912038.081015453,
        top: 10488456.659686875,
      },
      requestId: expect.any(Number),
    });
    expect(onDialogOpen).toHaveBeenCalledWith(false);
  });

  it('disables a preset whose srs has no registered projection, instead of letting it crash the map view', () => {
    // Regression guard: clicking a preset OpenLayers has no proj4
    // definition for used to crash the whole app ("Cannot read properties
    // of null (reading 'getExtent')") when ReduxMapViewComponent tried to
    // build a View for it - this disables that tile instead, which here
    // is exercised by having the mocked ol/proj.get() return null only
    // for North America's srs, the way the real one does for an
    // unregistered one.
    mockGetOlProjection.mockImplementation((srs) =>
      srs === 'EPSG:50001' ? null : fakeProjection,
    );

    const { store } = renderDialog();

    const tile = screen.getByRole('button', { name: 'North America' });
    expect(tile).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(tile);

    expect(store.getState().viewer.maps[MAP_ID].viewCommand).toBeUndefined();
  });
});
