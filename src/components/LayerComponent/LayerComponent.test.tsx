import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import { openLayersGetMapImageStore } from '@opengeoweb/webmap-react';
import { LayerComponent } from './LayerComponent';
import { AdagucLayer } from '../../store/types';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
}));

// A minimal working stand-in for WMImageStore's own event registry (see
// addImageEventCallback/removeEventCallback), so tests can fire a load
// event the same way a real completed GetMap request would, rather than
// just asserting against a jest.fn() mock.
jest.mock('@opengeoweb/webmap-react', () => {
  const callbacks: { id: string; callback: (...args: unknown[]) => void }[] =
    [];
  return {
    openLayersGetMapImageStore: {
      loadDuration: { getLoadDurationForId: jest.fn(() => undefined) },
      imagesbysrc: new Map(),
      addImageEventCallback: jest.fn((callback, id) => {
        callbacks.push({ id, callback });
      }),
      removeEventCallback: jest.fn((id) => {
        const index = callbacks.findIndex((entry) => entry.id === id);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }),
      testOnlyFireImageEvent: (image: unknown) => {
        callbacks.forEach((entry) => entry.callback(image));
      },
    },
  };
});

// Simulates a GetMap image request completing (successfully or not) for
// whichever layer(s) have an image-store listener registered - see
// addImageEventCallback above. The real store's own callback type can't
// be named here (WMImage/WMImageEventType aren't exported from
// @opengeoweb/webmap), so this is the one place that works around that,
// rather than scattering `any` through every test that needs it.
const fireImageEvent = (image: {
  getSrc: () => string;
  hasError: () => boolean;
}): void => {
  (
    openLayersGetMapImageStore as unknown as {
      testOnlyFireImageEvent: (image: unknown) => void;
    }
  ).testOnlyFireImageEvent(image);
};

jest.mock('./WMSLayerSelector', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../WMSComponents/WMSStyleSelector', () => ({
  __esModule: true,
  default: () => null,
}));

const mockGetWMLayerById = jest.mocked(getWMLayerById);
const mockGetLoadDurationForId = jest.mocked(
  // eslint-disable-next-line @typescript-eslint/unbound-method
  openLayersGetMapImageStore.loadDuration.getLoadDurationForId,
);

const baseLayer: AdagucLayer = {
  id: 'layer-1',
  name: 'air_pressure_msl',
  serviceUrl: 'http://localhost:8080/adagucserver',
  style: 'default',
  dimensions: [],
  enabled: true,
  opacity: 1,
};

const requiredProps = {
  serviceUrl: baseLayer.serviceUrl,
  layerIndex: 0,
  selectedStyleName: 'default',
  styles: [],
  isAnimating: false,
  onSelectLayer: jest.fn(),
  openLayerDetails: jest.fn(),
  onSelectStyle: jest.fn(),
  onChangeLayerEnabled: jest.fn(),
  onChangeOpacity: jest.fn(),
  onDuplicate: jest.fn(),
  getDimensionValue: jest.fn(),
  setDimensionValue: jest.fn(),
  getDimensionLinked: jest.fn(),
  setDimensionLinked: jest.fn(),
  removeLayer: jest.fn(),
  layerToggleAnimation: jest.fn(),
  zoomToLayer: jest.fn(),
  update: jest.fn(),
  onMoveUp: jest.fn(),
  onMoveDown: jest.fn(),
  canMoveUp: true,
  canMoveDown: true,
  onRefreshLayer: jest.fn().mockResolvedValue(undefined),
};

describe('LayerComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWMLayerById.mockReturnValue(undefined);
    mockGetLoadDurationForId.mockReturnValue(undefined);
    openLayersGetMapImageStore.imagesbysrc.clear();
  });

  it('shows the error icon with a tooltip when the layer has an error', () => {
    render(
      <LayerComponent
        {...requiredProps}
        layer={{ ...baseLayer, hasError: true }}
      />,
    );

    const icon = screen.getByTestId('WarningAmberIcon');
    expect(icon).toBeInTheDocument();
    // MUI's Tooltip sets the title as an aria-label on its child rather
    // than rendering visible text until hovered/focused.
    expect(icon).toHaveAttribute('aria-label', 'Layer has an error');
  });

  it('does not show the error icon when the layer has no error', () => {
    render(
      <LayerComponent
        {...requiredProps}
        layer={{ ...baseLayer, hasError: false }}
      />,
    );

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();
  });

  it('does not show the error icon when hasError is undefined', () => {
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();
  });

  it("shows a server-unreachable warning once this layer's GetMap image fails to load, and clears it once a later one succeeds", () => {
    // Regression guard: layer.hasError only reflects a failure at
    // add-layer time - this is the separate, later case where the server
    // goes down mid-session, after the layer was already working. There's
    // no prop for that, so it's driven by the image store's own
    // load-completion events - see imageSrcBelongsToLayer.
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://localhost:8080/adagucserver?',
      name: 'air_pressure_msl',
      dimensions: [],
      getDimension: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();

    act(() => {
      fireImageEvent({
        getSrc: () =>
          'http://localhost:8080/adagucserver?SERVICE=WMS&LAYERS=air_pressure_msl',
        hasError: () => true,
      });
    });

    const icon = screen.getByTestId('WarningAmberIcon');
    expect(icon).toHaveAttribute(
      'aria-label',
      "Server unreachable - could not load this layer's image",
    );

    act(() => {
      fireImageEvent({
        getSrc: () =>
          'http://localhost:8080/adagucserver?SERVICE=WMS&LAYERS=air_pressure_msl',
        hasError: () => false,
      });
    });

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();
  });

  it('clears the warning once a later request for a different view (bbox/time) of this layer succeeds, even though an older failed one is still cached', () => {
    // Regression guard: this used to poll a snapshot of the image store,
    // picking "the most recently touched" cached entry as the source of
    // truth - but the store also touches old, no-longer-relevant entries
    // while looking for an alternative image to show during loading, so
    // that touch could outrank a genuinely newer successful request and
    // the warning would never clear. Driving this off the store's own
    // load-completion events instead means whichever request actually
    // finished most recently is always what decides the result.
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://localhost:8080/adagucserver?',
      name: 'air_pressure_msl',
      dimensions: [],
      getDimension: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // An older bbox's request is still sitting in the cache, errored, from
    // when the server was down.
    openLayersGetMapImageStore.imagesbysrc.set(
      'http://localhost:8080/adagucserver?SERVICE=WMS&LAYERS=air_pressure_msl&BBOX=old',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { hasError: () => true } as any,
    );
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    expect(screen.getByTestId('WarningAmberIcon')).toBeInTheDocument();

    // The server is back up: a request for a new bbox succeeds.
    act(() => {
      fireImageEvent({
        getSrc: () =>
          'http://localhost:8080/adagucserver?SERVICE=WMS&LAYERS=air_pressure_msl&BBOX=new',
        hasError: () => false,
      });
    });

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();
  });

  it("ignores a failed image that belongs to a different layer's service", () => {
    mockGetWMLayerById.mockReturnValue({
      getmapURL: 'http://localhost:8080/adagucserver?',
      name: 'air_pressure_msl',
      dimensions: [],
      getDimension: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    act(() => {
      fireImageEvent({
        getSrc: () =>
          'http://localhost:8080/adagucserver?SERVICE=WMS&LAYERS=some_other_layer',
        hasError: () => true,
      });
    });

    expect(screen.queryByTestId('WarningAmberIcon')).not.toBeInTheDocument();
  });

  it('calls onMoveUp/onMoveDown when their buttons are clicked', () => {
    const onMoveUp = jest.fn();
    const onMoveDown = jest.fn();
    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move layer up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move layer down' }));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('disables the move buttons at the top/bottom of the list', () => {
    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        canMoveUp={false}
        canMoveDown={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Move layer up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move layer down' }),
    ).toBeDisabled();
  });

  it('reloads capabilities and refreshes the view when the refresh button is clicked', async () => {
    const update = jest.fn();
    const onRefreshLayer = jest.fn().mockResolvedValue(undefined);
    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        update={update}
        onRefreshLayer={onRefreshLayer}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload layer capabilities' }),
    );

    expect(onRefreshLayer).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(update).toHaveBeenCalled());
  });

  it('disables the refresh button while a refresh is in flight', async () => {
    let resolveRefresh: () => void = () => {};
    const onRefreshLayer = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        onRefreshLayer={onRefreshLayer}
      />,
    );

    const refreshButton = screen.getByRole('button', {
      name: 'Reload layer capabilities',
    });
    fireEvent.click(refreshButton);

    expect(refreshButton).toBeDisabled();

    resolveRefresh();
    await waitFor(() => expect(refreshButton).not.toBeDisabled());
  });

  it('shows the dataset name when the service url has a DATASET param', () => {
    render(
      <LayerComponent
        {...requiredProps}
        serviceUrl="https://geoservices.knmi.nl/adagucserver?dataset=adaguc.tests.ahn_utrechtse_heuvelrug_500m&"
        layer={baseLayer}
      />,
    );

    expect(
      screen.getByText('adaguc.tests.ahn_utrechtse_heuvelrug_500m'),
    ).toBeInTheDocument();
  });

  it('does not show a dataset line when the service url has no DATASET param', () => {
    render(
      <LayerComponent
        {...requiredProps}
        serviceUrl="https://example.com/wms?SERVICE=WMS"
        layer={baseLayer}
      />,
    );

    expect(screen.queryByText(/^Dataset:/)).not.toBeInTheDocument();
  });

  it('shows a copy-pastable GetCapabilities url built from the service url', () => {
    render(
      <LayerComponent
        {...requiredProps}
        serviceUrl="https://geoservices.knmi.nl/adagucserver?dataset=adaguc.tests.ahn_utrechtse_heuvelrug_500m&"
        layer={baseLayer}
      />,
    );

    expect(
      screen.getByText(
        'https://geoservices.knmi.nl/adagucserver?dataset=adaguc.tests.ahn_utrechtse_heuvelrug_500m&SERVICE=WMS&REQUEST=GetCapabilities',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to a sane separator when the service url has no trailing ? or &', () => {
    render(
      <LayerComponent
        {...requiredProps}
        serviceUrl="https://example.com/wms"
        layer={baseLayer}
      />,
    );

    expect(
      screen.getByText(
        'https://example.com/wms?SERVICE=WMS&REQUEST=GetCapabilities',
      ),
    ).toBeInTheDocument();
  });

  it('shows a copy button for the layer title right before it, in the card header', async () => {
    mockGetWMLayerById.mockReturnValue({
      title: 'Air pressure at mean sea level',
      dimensions: [],
      getDimension: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    expect(
      screen.getByText('Layer Air pressure at mean sea level'),
    ).toBeInTheDocument();

    const copyButtons = screen.getAllByRole('button', { name: 'copy' });
    fireEvent.mouseOver(copyButtons[0]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Copy layer title (Air pressure at mean sea level)',
    );
  });

  it('shows a copy button for the layer name right before the layer dropdown, with a tooltip advertising it', async () => {
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    // copyButtons[0] is the card header's own layer title copy button;
    // [1] is the GetCapabilities url's, still shown in the header
    // subtitle; [2] is the layer name's, now sitting right before the
    // (here mocked-out) layer dropdown instead of down in that subtitle;
    // [3] is the new style name one, before the style dropdown.
    const copyButtons = screen.getAllByRole('button', { name: 'copy' });
    expect(copyButtons).toHaveLength(4);
    fireEvent.mouseOver(copyButtons[2]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Copy layer name (air_pressure_msl)',
    );
  });

  it('adds a copy button for the style name right before the style dropdown, with a tooltip advertising the style id and layer name', async () => {
    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        selectedStyleName="style_a"
      />,
    );

    const copyButtons = screen.getAllByRole('button', { name: 'copy' });
    expect(copyButtons).toHaveLength(4);
    fireEvent.mouseOver(copyButtons[3]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Copy style name (style_a) for layer air_pressure_msl',
    );
  });

  it('adds a copy button for each dimension value right before its slider, with a tooltip advertising it', async () => {
    const fakeTimeDimension = {
      name: 'time',
      units: '',
      linked: false,
      getIndexForValue: jest.fn(() => 0),
      getValueForIndex: jest.fn(() => '2024-01-01T00:00:00Z'),
      size: jest.fn(() => 5),
    };
    mockGetWMLayerById.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2024-01-01T00:00:00Z' }],
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        getDimensionValue={jest.fn(() => '2024-01-01T00:00:00Z')}
      />,
    );

    // [0] layer title (card header), [1] GetCapabilities url, [2] layer
    // name, [3] style name, [4] the new dimension value one, right before
    // its (real, unmocked) slider.
    const copyButtons = screen.getAllByRole('button', { name: 'copy' });
    expect(copyButtons).toHaveLength(5);
    fireEvent.mouseOver(copyButtons[4]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Copy time value (2024-01-01T00:00:00Z) for layer air_pressure_msl',
    );
  });

  it("reflects the dimension's linked state and reports toggling it, for the global time slider sync group", () => {
    const fakeTimeDimension = {
      name: 'time',
      units: '',
      getIndexForValue: jest.fn(() => 0),
      getValueForIndex: jest.fn(() => '2024-01-01T00:00:00Z'),
      size: jest.fn(() => 5),
    };
    mockGetWMLayerById.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2024-01-01T00:00:00Z' }],
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const setDimensionLinked = jest.fn();

    render(
      <LayerComponent
        {...requiredProps}
        layer={baseLayer}
        getDimensionValue={jest.fn(() => '2024-01-01T00:00:00Z')}
        getDimensionLinked={jest.fn(() => false)}
        setDimensionLinked={setDimensionLinked}
      />,
    );

    const linkCheckbox = screen.getByRole('checkbox');
    expect(linkCheckbox).not.toBeChecked();

    fireEvent.click(linkCheckbox);

    expect(setDimensionLinked).toHaveBeenCalledWith('time', true);
  });

  it('shows a placeholder for the last GetMap duration until one has completed', () => {
    render(<LayerComponent {...requiredProps} layer={baseLayer} />);

    expect(screen.getByText('--- ms')).toBeInTheDocument();
  });

  it('shows the last GetMap request duration once a GetMap has completed, and keeps it up to date', () => {
    jest.useFakeTimers();
    try {
      mockGetLoadDurationForId.mockReturnValue(undefined);
      render(<LayerComponent {...requiredProps} layer={baseLayer} />);

      mockGetLoadDurationForId.mockReturnValue(142);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.getByText('142 ms')).toBeInTheDocument();

      // A later GetMap request for the same layer replaces the shown
      // duration, without needing the layer to be remounted.
      mockGetLoadDurationForId.mockReturnValue(87);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.getByText('87 ms')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
