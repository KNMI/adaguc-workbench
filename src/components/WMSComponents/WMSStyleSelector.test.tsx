import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Style } from '@opengeoweb/webmap';
import WMSStyleSelector from './WMSStyleSelector';

const makeStyle = (name: string, title: string): Style => ({
  name,
  title,
  legendURL: '',
  abstract: '',
});

const twoStyles: Style[] = [
  makeStyle('a', 'Style A'),
  makeStyle('b', 'Style B'),
];

describe('WMSStyleSelector', () => {
  it('shows the current position and total in the closed dropdown', () => {
    // styleList is [a, b, default], so "b" is the 2nd of 3.
    render(
      <WMSStyleSelector
        styleName="b"
        styles={twoStyles}
        onSelectStyle={vi.fn()}
      />,
    );

    expect(screen.getByText('(2/3) Style B')).toBeInTheDocument();
  });

  it('cycles to the next style, wrapping around at the end', () => {
    const onSelectStyle = vi.fn();
    // styleList is [a, b, default] - starting at the last entry.
    render(
      <WMSStyleSelector
        styleName="default"
        styles={twoStyles}
        onSelectStyle={onSelectStyle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next style' }));

    expect(onSelectStyle).toHaveBeenCalledWith('a');
  });

  it('cycles to the previous style, wrapping around at the start', () => {
    const onSelectStyle = vi.fn();
    render(
      <WMSStyleSelector
        styleName="a"
        styles={twoStyles}
        onSelectStyle={onSelectStyle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous style' }));

    expect(onSelectStyle).toHaveBeenCalledWith('default');
  });

  it('disables the cycle buttons when only the default style is available', () => {
    render(
      <WMSStyleSelector
        styleName="default"
        styles={[]}
        onSelectStyle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Previous style' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next style' })).toBeDisabled();
  });
});
