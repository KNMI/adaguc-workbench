import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WMLayer } from '@opengeoweb/webmap';
import { refreshLayerSource } from '../../utils/refreshLayerSource';
import WMSColorRangeSelector from './WMSColorRangeSelector';

jest.mock('../../utils/refreshLayerSource', () => ({
  refreshLayerSource: jest.fn(),
}));

const makeLayer = (url: string): WMLayer =>
  ({ wmsextensions: { url } }) as unknown as WMLayer;

describe('WMSColorRangeSelector', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts from the color scale range the layer already requests', () => {
    render(
      <WMSColorRangeSelector
        wmLayer={makeLayer('&COLORSCALERANGE=-5.000,40.000')}
      />,
    );

    expect(screen.getByLabelText('Min value')).toHaveValue('-5.000');
    expect(screen.getByLabelText('Max value')).toHaveValue('40.000');
  });

  it('starts from 0 to 1 when the layer requests no color scale range', () => {
    render(<WMSColorRangeSelector wmLayer={makeLayer('')} />);

    expect(screen.getByLabelText('Min value')).toHaveValue('0.000');
    expect(screen.getByLabelText('Max value')).toHaveValue('1.000');
  });

  it('applies an edited range to the layer when Enter is pressed', () => {
    const wmLayer = makeLayer('');
    render(<WMSColorRangeSelector wmLayer={wmLayer} />);

    const min = screen.getByLabelText('Min value');
    fireEvent.change(min, { target: { value: '2' } });
    fireEvent.keyUp(min, { code: 'Enter' });

    expect(wmLayer.wmsextensions.url).toBe('&COLORSCALERANGE=2.000,1.000');
    expect(refreshLayerSource).toHaveBeenCalledWith(wmLayer);
    expect(min).toHaveValue('2.000');
  });

  it('clears the range from the layer and the fields when Reset is clicked', () => {
    // Regression guard: Reset used to clear the layer's range but leave the
    // old numbers in both fields.
    const wmLayer = makeLayer('&COLORSCALERANGE=-5.000,40.000');
    render(<WMSColorRangeSelector wmLayer={wmLayer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(wmLayer.wmsextensions.url).toBe('');
    expect(refreshLayerSource).toHaveBeenCalledWith(wmLayer);
    expect(screen.getByLabelText('Min value')).toHaveValue('0.000');
    expect(screen.getByLabelText('Max value')).toHaveValue('1.000');
  });
});
