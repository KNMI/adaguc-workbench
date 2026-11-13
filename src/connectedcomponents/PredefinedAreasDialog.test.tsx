import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { get as getOlProjection } from 'ol/proj';
import Projection from 'ol/proj/Projection';
import { useAppDispatch } from '../store/store';
import PredefinedAreasDialog from './PredefinedAreasDialog';

const fakeProjection = {} as Projection;

jest.mock('../store/store', () => ({
  actions: {
    requestSetProjection: (payload: unknown) => ({
      type: 'wmsservices/requestSetProjection',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
}));

jest.mock('ol/proj', () => ({
  get: jest.fn(() => ({})),
}));

const mockGetOlProjection = jest.mocked(getOlProjection);

jest.mock('../utils/registerExtraProjections', () => ({
  registerExtraProjections: jest.fn(),
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);

describe('PredefinedAreasDialog', () => {
  afterEach(() => {
    mockGetOlProjection.mockImplementation(() => fakeProjection);
  });

  it('lists every predefined area as a clickable tile', () => {
    mockUseAppDispatch.mockReturnValue(jest.fn());

    render(<PredefinedAreasDialog isDialogOpen onDialogOpen={jest.fn()} />);

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
    mockUseAppDispatch.mockReturnValue(jest.fn());

    render(<PredefinedAreasDialog isDialogOpen onDialogOpen={jest.fn()} />);

    expect(screen.getByText('EPSG:54030')).toBeInTheDocument();
    expect(screen.getByText('EPSG:28992')).toBeInTheDocument();
  });

  it('dispatches requestSetProjection with the picked area and closes the dialog', () => {
    const dispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(dispatch);
    const onDialogOpen = jest.fn();

    render(<PredefinedAreasDialog isDialogOpen onDialogOpen={onDialogOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Robinson' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'wmsservices/requestSetProjection',
      payload: {
        mapId: 'map1',
        srs: 'EPSG:54030',
        bbox: {
          left: -17036744.451383516,
          bottom: -10711364.114367772,
          right: 16912038.081015453,
          top: 10488456.659686875,
        },
      },
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
    const dispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(dispatch);
    mockGetOlProjection.mockImplementation((srs) =>
      srs === 'EPSG:50001' ? null : fakeProjection,
    );

    render(<PredefinedAreasDialog isDialogOpen onDialogOpen={jest.fn()} />);

    const tile = screen.getByRole('button', { name: 'North America' });
    expect(tile).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(tile);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
