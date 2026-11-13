import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LayerPanel from './LayerPanel';

// The list itself has its own tests.
jest.mock('./SortableLayerList', () => ({
  SortableLayerList: () => <div data-testid="layer-list" />,
}));

describe('LayerPanel', () => {
  it('shows the layer list, with a button to collapse the panel', () => {
    const onToggleExpanded = jest.fn();
    render(
      <LayerPanel
        mapId="map1"
        isExpanded
        onToggleExpanded={onToggleExpanded}
      />,
    );

    expect(screen.getByTestId('layer-list')).toBeVisible();
    expect(screen.getByText('Layers')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse layer panel' }),
    );

    expect(onToggleExpanded).toHaveBeenCalledWith(false);
  });

  it('hides the layer list (keeping it mounted) when collapsed, with a button to expand it again', () => {
    const onToggleExpanded = jest.fn();
    render(
      <LayerPanel
        mapId="map1"
        isExpanded={false}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    expect(screen.getByTestId('layer-list')).not.toBeVisible();
    expect(screen.queryByText('Layers')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand layer panel' }));

    expect(onToggleExpanded).toHaveBeenCalledWith(true);
  });
});
