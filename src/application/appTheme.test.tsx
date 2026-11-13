import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useTheme } from '@mui/material';
import { AppThemeProvider } from './appTheme';
import ColorSchemeButton from '../connectedcomponents/ColorSchemeButton';

// Reports the palette mode MUI components see, and the CSS variable the
// app's own styles read.
const ShowScheme = (): React.ReactElement => {
  const theme = useTheme();
  return <div data-testid="mode">{theme.palette.mode}</div>;
};
const surfaceVariable = (): string =>
  getComputedStyle(document.documentElement)
    .getPropertyValue('--awb-surface')
    .trim();

// jsdom has no matchMedia; this one answers for the system's dark setting -
// which the app should not follow.
const mockSystemPrefersDark = (dark: boolean): void => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' && dark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const renderApp = () =>
  render(
    <AppThemeProvider>
      <ShowScheme />
      <ColorSchemeButton />
    </AppThemeProvider>,
  );

describe('AppThemeProvider', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts light, even when the system prefers dark', () => {
    mockSystemPrefersDark(true);
    renderApp();

    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(surfaceVariable()).toBe('#fafaf9');
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument();
  });

  it('starts dark when that was chosen before', () => {
    window.localStorage.setItem('awb-color-scheme', 'dark');
    renderApp();

    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(surfaceVariable()).toBe('#22282c');
  });

  it('switches between light and dark, remembering the choice', () => {
    renderApp();
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(screen.getByTestId('LightModeIcon')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
    expect(screen.getByTestId('DarkModeIcon')).toBeInTheDocument();
    expect(window.localStorage.getItem('awb-color-scheme')).toBe('dark');

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
    expect(window.localStorage.getItem('awb-color-scheme')).toBe('light');
  });
});
