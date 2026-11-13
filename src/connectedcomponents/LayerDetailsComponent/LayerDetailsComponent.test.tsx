import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getWMLayerById, queryWMSLayers } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import LayerDetailsComponent from './LayerDetailsComponent';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
  queryWMSLayers: jest.fn(),
}));

jest.mock('./ProjectionSelector', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./AdagucNCDumpPanel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./WMSColorRangeSelector', () => ({
  __esModule: true,
  default: () => null,
}));

let lastWCSPanelDialogProps:
  { isOpen: boolean; onClose: () => void } | undefined;
jest.mock('./WCSPanelDialog', () => ({
  __esModule: true,
  default: (props: { isOpen: boolean; onClose: () => void }) => {
    lastWCSPanelDialogProps = props;
    return props.isOpen ? <div data-testid="wcs-panel-dialog" /> : null;
  },
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = jest.mocked(getWMLayerById) as jest.MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockQueryWMSLayers = jest.mocked(queryWMSLayers);

describe('LayerDetailsComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastWCSPanelDialogProps = undefined;
    mockQueryWMSLayers.mockResolvedValue([]);
    mockGetWMLayerById.mockReturnValue({
      id: 'layer-1',
      name: 'air_pressure_msl',
      title: 'Air pressure',
      service: 'http://example.com/wms?',
      dimensions: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('opens the WCS popup when the WCS button is clicked, and closes it again', () => {
    render(<LayerDetailsComponent mapId="map1" layerId="layer-1" />);

    expect(screen.queryByTestId('wcs-panel-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'WCS' }));

    expect(screen.getByTestId('wcs-panel-dialog')).toBeInTheDocument();

    act(() => {
      lastWCSPanelDialogProps?.onClose();
    });

    expect(screen.queryByTestId('wcs-panel-dialog')).not.toBeInTheDocument();
  });

  it('renders once the layer becomes available after first showing "No layer found"', () => {
    // Regression guard: the early "No layer found" return used to sit
    // before some of this component's hooks, so a render without the
    // layer called fewer hooks than a later render with it - React then
    // throws "Rendered more hooks than during the previous render".
    mockGetWMLayerById.mockReturnValue(undefined);
    const { rerender } = render(
      <LayerDetailsComponent mapId="map1" layerId="layer-1" />,
    );
    expect(screen.getByText('No layer found')).toBeInTheDocument();
    expect(mockQueryWMSLayers).not.toHaveBeenCalled();

    mockGetWMLayerById.mockReturnValue({
      id: 'layer-1',
      name: 'air_pressure_msl',
      title: 'Air pressure',
      service: 'http://example.com/wms?',
      dimensions: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    rerender(<LayerDetailsComponent mapId="map1" layerId="layer-1" />);

    expect(screen.queryByText('No layer found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WCS' })).toBeInTheDocument();
    expect(mockQueryWMSLayers).toHaveBeenCalledWith('http://example.com/wms?');
  });
});
