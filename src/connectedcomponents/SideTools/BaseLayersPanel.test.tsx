import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { LayerType } from '@opengeoweb/webmap';
import { createAppStore } from '../../store/store';
import { AdagucBaseLayer } from '../../store/types';
import BaseLayersPanel from './BaseLayersPanel';

const baseMap: AdagucBaseLayer = {
  id: 'baselayer-worldmap',
  name: 'WorldMap',
  title: 'KNMI Basemap',
  type: 'twms',
  layerType: LayerType.baseLayer,
  enabled: true,
};

const overlay: AdagucBaseLayer = {
  id: 'overlay-countryborders',
  name: 'countryborders',
  title: 'World country borders',
  format: 'image/png',
  service: 'https://geoservices.knmi.nl/wms?DATASET=baselayers&',
  layerType: LayerType.overLayer,
  enabled: false,
};

// Renders the panel inside a real store holding just these two base layers.
const renderPanel = () => {
  const store = createAppStore({
    viewer: { maps: {}, services: {}, baseLayers: [baseMap, overlay] },
  });
  render(
    <Provider store={store}>
      <BaseLayersPanel />
    </Provider>,
  );
  return store;
};

const isEnabled = (
  store: ReturnType<typeof createAppStore>,
  id: string,
): boolean | undefined =>
  store.getState().viewer.baseLayers.find((layer) => layer.id === id)?.enabled;

describe('BaseLayersPanel', () => {
  it('renders base maps and overlays with their current enabled state', () => {
    renderPanel();

    expect(screen.getByText('KNMI Basemap')).toBeInTheDocument();
    expect(screen.getByText('World country borders')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'KNMI Basemap' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'World country borders' }),
    ).not.toBeChecked();
  });

  it('toggles the enabled state of a base layer in the store when its checkbox is clicked', () => {
    const store = renderPanel();

    fireEvent.click(screen.getByRole('checkbox', { name: 'KNMI Basemap' }));

    expect(isEnabled(store, 'baselayer-worldmap')).toBe(false);
    expect(
      screen.getByRole('checkbox', { name: 'KNMI Basemap' }),
    ).not.toBeChecked();

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'World country borders' }),
    );

    expect(isEnabled(store, 'overlay-countryborders')).toBe(true);
    expect(
      screen.getByRole('checkbox', { name: 'World country borders' }),
    ).toBeChecked();
  });
});
