import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  useQueryGetWMSLayers,
  useQueryGetWMSLayersTree,
} from '@opengeoweb/webmap-react';
import WMSLayerSelector from './WMSLayerSelector';

vi.mock('@opengeoweb/webmap', () => ({
  generateLayerId: vi.fn(() => 'generated-id'),
}));

vi.mock('@opengeoweb/webmap-react', () => ({
  useQueryGetWMSLayers: vi.fn(),
  useQueryGetWMSLayersTree: vi.fn(),
}));

const mockUseQueryGetWMSLayers = vi.mocked(useQueryGetWMSLayers);
const mockUseQueryGetWMSLayersTree = vi.mocked(useQueryGetWMSLayersTree);

const serviceUrl = 'http://example.com/wms?';

const threeLayers = [
  { name: 'layer-a', title: 'Layer A' },
  { name: 'layer-b', title: 'Layer B' },
  { name: 'layer-c', title: 'Layer C' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any;

describe('WMSLayerSelector', () => {
  beforeEach(() => {
    mockUseQueryGetWMSLayersTree.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the current position and total in the closed dropdown', () => {
    mockUseQueryGetWMSLayers.mockReturnValue(threeLayers);

    render(
      <WMSLayerSelector
        layerName="layer-b"
        serviceUrl={serviceUrl}
        onSelectLayer={vi.fn()}
      />,
    );

    expect(screen.getByText('(2/3) Layer B')).toBeInTheDocument();
  });

  it('cycles to the next layer, wrapping around at the end', () => {
    mockUseQueryGetWMSLayers.mockReturnValue(threeLayers);
    const onSelectLayer = vi.fn();

    render(
      <WMSLayerSelector
        layerName="layer-c"
        serviceUrl={serviceUrl}
        onSelectLayer={onSelectLayer}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next layer' }));

    expect(onSelectLayer).toHaveBeenCalledWith('layer-a');
  });

  it('cycles to the previous layer, wrapping around at the start', () => {
    mockUseQueryGetWMSLayers.mockReturnValue(threeLayers);
    const onSelectLayer = vi.fn();

    render(
      <WMSLayerSelector
        layerName="layer-a"
        serviceUrl={serviceUrl}
        onSelectLayer={onSelectLayer}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous layer' }));

    expect(onSelectLayer).toHaveBeenCalledWith('layer-c');
  });

  it('disables the cycle buttons when there is only one layer', () => {
    mockUseQueryGetWMSLayers.mockReturnValue([
      { name: 'layer-a', title: 'Layer A' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    render(
      <WMSLayerSelector
        layerName="layer-a"
        serviceUrl={serviceUrl}
        onSelectLayer={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Previous layer' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next layer' })).toBeDisabled();
  });
});
