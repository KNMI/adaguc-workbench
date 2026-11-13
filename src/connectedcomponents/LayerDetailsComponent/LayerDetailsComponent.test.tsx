import type { MockedFunction } from 'vitest';
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getWMLayerById, queryWMSLayers } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import LayerDetailsComponent from './LayerDetailsComponent';

vi.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: vi.fn(),
  queryWMSLayers: vi.fn(),
}));

vi.mock('./ProjectionSelector', () => ({
  default: () => null,
}));
vi.mock('./AdagucNCDumpPanel', () => ({
  default: () => null,
}));
vi.mock('./WMSColorRangeSelector', () => ({
  default: () => null,
}));

let lastWCSPanelDialogProps:
  { isOpen: boolean; onClose: () => void } | undefined;
vi.mock('./WCSPanelDialog', () => ({
  default: (props: { isOpen: boolean; onClose: () => void }) => {
    lastWCSPanelDialogProps = props;
    return props.isOpen ? <div data-testid="wcs-panel-dialog" /> : null;
  },
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockQueryWMSLayers = vi.mocked(queryWMSLayers);

describe('LayerDetailsComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
