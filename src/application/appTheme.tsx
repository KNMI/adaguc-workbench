import * as React from 'react';
import { GlobalStyles } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { lightTheme } from '@opengeoweb/theme';

// The viewer's colours, taken from its default base map ("KNMI Basemap
// Light Grey Canvas"): its warm off-white land, its blue-grey water, and
// the dark grey of its borders - with a muted slate blue, a darker shade
// of that same water, as the one accent colour for anything interactive.
// Data colours (chart series, layer styles) are deliberately left alone.
export const awbColors = {
  // Cards, fields and other surfaces - the base map's land.
  surface: '#fafaf9',
  // Panel backgrounds, between land and water.
  panel: '#eef0f1',
  // Header strips and other quiet fills - the base map's water.
  water: '#d4d9dc',
  // Hover on those fills, and table/divider lines.
  waterDark: '#c3cacf',
  // Text and strong lines - the base map's borders.
  line: '#33393d',
  // The accent: buttons, sliders, selection.
  accent: '#4d6474',
  accentDark: '#384a57',
  accentLight: '#8798a5',
};

// One typeface for the whole app; the monospaced one only for raw text
// dumps (JSON, ncdump output).
export const awbFonts = {
  sans: '"Roboto", "Helvetica", "Arial", sans-serif',
  mono: '"Roboto Mono", "Menlo", "Consolas", monospace',
};

// opengeoweb's light theme (which the rest of its components are styled
// for) with this palette on top - it sets no accent colour of its own, so
// buttons, sliders, tabs and the top bar otherwise fall back to MUI's
// default bright blue.
export const appTheme = createTheme(lightTheme, {
  palette: {
    primary: {
      main: awbColors.accent,
      dark: awbColors.accentDark,
      light: awbColors.accentLight,
      contrastText: '#ffffff',
    },
    background: {
      paper: awbColors.surface,
      default: awbColors.panel,
    },
    divider: awbColors.waterDark,
  },
  typography: {
    fontFamily: awbFonts.sans,
  },
  components: {
    // MUI tooltips are "interactive" by default: the pointer can rest on
    // them and they stay open, covering whatever controls are underneath.
    // Not interactive, a tooltip closes as soon as the pointer moves onto
    // it, and lets clicks through to what's below.
    MuiTooltip: {
      defaultProps: {
        disableInteractive: true,
      },
    },
    // opengeoweb's theme colours these with its own bright blue - the
    // accent instead, like every other control.
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: awbColors.accentLight,
          '&.Mui-checked': { color: awbColors.accent },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: awbColors.accentLight,
          '&.Mui-checked': { color: awbColors.accent },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: awbColors.accent },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        // A light bar, like the map under it, rather than a block of
        // accent colour.
        root: {
          backgroundColor: awbColors.surface,
          color: awbColors.line,
          borderBottom: `1px solid ${awbColors.water}`,
        },
      },
    },
  },
});

// The same palette as CSS variables, for src/assets/styles.css - so the
// stylesheet and the theme can't drift apart.
export const AppColorVariables = (): React.ReactElement => (
  <GlobalStyles
    styles={{
      ':root': {
        '--awb-surface': awbColors.surface,
        '--awb-panel': awbColors.panel,
        '--awb-water': awbColors.water,
        '--awb-water-dark': awbColors.waterDark,
        '--awb-line': awbColors.line,
        '--awb-accent': awbColors.accent,
        '--awb-font-sans': awbFonts.sans,
        '--awb-font-mono': awbFonts.mono,
      },
      // <code> marks identifiers (layer names, datasets, urls) - shown in
      // the app's own typeface rather than the browser's default
      // monospaced one.
      code: {
        fontFamily: 'inherit',
        fontSize: 'inherit',
      },
    }}
  />
);
