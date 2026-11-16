import * as React from 'react';
import { act, screen } from '@testing-library/react';
import { thunks } from '../store/thunks';
import { emptyMap, renderWithStore } from '../testUtils/renderWithStore';
import LayerAddedSnackbar from './LayerAddedSnackbar';

const mapId = 'map1';
const request = {
  mapId,
  name: 'RAD_NL25_PCP_CM',
  serviceUrl: 'https://example.com/wms?',
  announce: true,
};
const added = (
  requestId: string,
  result: { title: string | undefined; hasError: boolean },
) =>
  thunks.addLayer.fulfilled(
    {
      ...request,
      id: `layer-${requestId}`,
      dimensions: [],
      enabled: true,
      opacity: 1,
      styleName: undefined,
      ...result,
    },
    requestId,
    request,
  );

describe('LayerAddedSnackbar', () => {
  it('confirms a layer the user added, by its title', () => {
    const { store } = renderWithStore(<LayerAddedSnackbar />, {
      [mapId]: emptyMap(),
    });
    expect(screen.queryByText(/Added layer/)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(
        added('request-1', {
          title: 'Precipitation Radar NL',
          hasError: false,
        }),
      );
    });

    expect(
      screen.getByText('Added layer Precipitation Radar NL ✅'),
    ).toBeInTheDocument();
  });

  it('says so when the layer was added but its service could not be read', () => {
    const { store } = renderWithStore(<LayerAddedSnackbar />, {
      [mapId]: emptyMap(),
    });

    act(() => {
      store.dispatch(added('request-1', { title: undefined, hasError: true }));
    });

    expect(
      screen.getByText(
        /Added layer RAD_NL25_PCP_CM, but its service could not be read/,
      ),
    ).toBeInTheDocument();
  });
});
