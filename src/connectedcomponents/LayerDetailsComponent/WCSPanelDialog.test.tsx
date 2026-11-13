import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { WMLayer } from '@opengeoweb/webmap';
import WCSPanelDialog from './WCSPanelDialog';

vi.mock('./WCSPanel', () => ({
  default: () => <div data-testid="wcs-panel" />,
}));

const fakeWMLayer = {
  id: 'layer-1',
  name: 'air_pressure_msl',
  title: 'Air pressure at mean sea level',
  service: 'https://example.com/wms?',
  dimensions: [],
} as unknown as WMLayer;

describe('WCSPanelDialog', () => {
  it('shows the WCS panel and its title when open with a layer', () => {
    render(
      <WCSPanelDialog
        mapId="map1"
        wmLayer={fakeWMLayer}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('wcs-panel')).toBeInTheDocument();
    expect(
      screen.getByText('WCS - Air pressure at mean sea level'),
    ).toBeInTheDocument();
  });

  it('does not render the panel content when closed', () => {
    render(
      <WCSPanelDialog
        mapId="map1"
        wmLayer={fakeWMLayer}
        isOpen={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('wcs-panel')).not.toBeInTheDocument();
  });

  it('does not render the panel content when there is no layer yet', () => {
    render(
      <WCSPanelDialog mapId="map1" wmLayer={null} isOpen onClose={vi.fn()} />,
    );

    expect(screen.queryByTestId('wcs-panel')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <WCSPanelDialog
        mapId="map1"
        wmLayer={fakeWMLayer}
        isOpen
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText('close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
