import * as React from 'react';
import { GlobalStyles } from '@mui/material';
import { createTheme, Theme } from '@mui/material/styles';
import { darkTheme, lightTheme, ThemeWrapper } from '@opengeoweb/theme';

interface AwbPalette {
  // Cards, fields and other surfaces.
  surface: string;
  // Panel backgrounds.
  panel: string;
  // A pattern drawn over the panel background (a CSS background image), or
  // 'none'.
  panelTexture: string;
  // Header strips and other quiet fills.
  water: string;
  // Hover on those fills, card borders, and table/divider lines.
  waterDark: string;
  // Text and strong lines.
  line: string;
  // The accent: buttons, sliders, selection.
  accent: string;
  accentDark: string;
  accentLight: string;
  // Text on an accent background.
  onAccent: string;
}

export type ColorScheme = 'light' | 'dark' | 'classic';

const COLOR_SCHEMES: ColorScheme[] = ['light', 'dark', 'classic'];

// The viewer's colours. Light is taken from its default base map ("KNMI
// Basemap Light Grey Canvas"): its warm off-white land, its blue-grey water,
// and the dark grey of its borders - with a muted slate blue, a darker shade
// of that same water, as the one accent colour for anything interactive.
// Dark keeps the same slate family, with the light and dark ends swapped.
// Classic is the look of the original ADAGUC viewer: striped lavender panels,
// white cards with a periwinkle border, and blue-violet controls. Data
// colours (chart series, layer styles) are deliberately left alone, and so is
// the map itself: the base map is whatever the user picks.
const palettes: Record<ColorScheme, AwbPalette> = {
  light: {
    surface: '#fafaf9',
    panel: '#eef0f1',
    panelTexture: 'none',
    water: '#d4d9dc',
    waterDark: '#c3cacf',
    line: '#33393d',
    accent: '#4d6474',
    accentDark: '#384a57',
    accentLight: '#8798a5',
    onAccent: '#ffffff',
  },
  dark: {
    surface: '#22282c',
    panel: '#1a1f22',
    panelTexture: 'none',
    water: '#2e363b',
    waterDark: '#3d474d',
    line: '#e2e6e8',
    accent: '#93aabb',
    accentDark: '#b2c4d1',
    accentLight: '#5e7484',
    onAccent: '#11161a',
  },
  classic: {
    surface: '#ffffff',
    panel: '#d5d3ea',
    panelTexture:
      'repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0 2px, transparent 2px 6px)',
    water: '#e6e6f4',
    waterDark: '#8a8ee8',
    line: '#1a1a33',
    accent: '#3c4bbf',
    accentDark: '#2a3590',
    accentLight: '#8a8ee8',
    onAccent: '#ffffff',
  },
};

const cssVariable = (key: keyof AwbPalette): string =>
  `--awb-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

// The palette for components' own styles, as CSS variables - so they follow
// the current colour scheme without re-rendering for it.
export const awbColors = Object.fromEntries(
  Object.keys(palettes.light).map((key) => [
    key,
    `var(${cssVariable(key as keyof AwbPalette)})`,
  ]),
) as unknown as AwbPalette;

// A panel's background: its texture (if any) over its colour.
export const awbPanelBackground = `${awbColors.panelTexture}, ${awbColors.panel}`;

// One typeface for the whole app - Roboto, or Arial for the classic look -
// and a monospaced one only for raw text dumps (JSON, ncdump output).
const sansFonts: Record<ColorScheme, string> = {
  light: '"Roboto", "Helvetica", "Arial", sans-serif',
  dark: '"Roboto", "Helvetica", "Arial", sans-serif',
  classic: '"Arial", "Liberation Sans", "Helvetica", sans-serif',
};
const monoFont = '"Roboto Mono", "Menlo", "Consolas", monospace';

// The classic viewer's smaller, denser Arial text. opengeoweb's theme gives
// every text style (body1, caption, h6, ...) its own font and size, so
// setting the theme-wide ones alone changes nothing - each style is
// rewritten here, at 12/14 of its size (MUI's default base size is 14).
const classicTypography = (): Record<string, unknown> => {
  const fontFamily = sansFonts.classic;
  const styles = Object.entries(
    lightTheme.typography as unknown as Record<string, unknown>,
  ).flatMap(
    ([name, style]): [string, { fontFamily: string; fontSize: string }][] => {
      const fontSize = (style as { fontSize?: unknown } | null)?.fontSize;
      if (typeof fontSize !== 'string' || !fontSize.endsWith('rem')) {
        return [];
      }
      const scaled = Math.round(parseFloat(fontSize) * (12 / 14) * 1000) / 1000;
      return [[name, { fontFamily, fontSize: `${scaled}rem` }]];
    },
  );
  return { fontFamily, fontSize: 12, ...Object.fromEntries(styles) };
};

// opengeoweb's light or dark theme (which the rest of its components are
// styled for) with this palette on top - it sets no accent colour of its
// own, so buttons, sliders, tabs and the top bar otherwise fall back to
// MUI's default bright blue.
export const createAppTheme = (scheme: ColorScheme): Theme => {
  const colors = palettes[scheme];
  const isClassic = scheme === 'classic';
  return createTheme(scheme === 'dark' ? darkTheme : lightTheme, {
    palette: {
      primary: {
        main: colors.accent,
        dark: colors.accentDark,
        light: colors.accentLight,
        contrastText: colors.onAccent,
      },
      background: {
        paper: colors.surface,
        default: colors.panel,
      },
      divider: colors.waterDark,
    },
    typography: isClassic
      ? classicTypography()
      : { fontFamily: sansFonts[scheme] },
    // And its squarer corners.
    ...(isClassic && { shape: { borderRadius: 2 } }),
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
            color: colors.accentLight,
            '&.Mui-checked': { color: colors.accent },
          },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: {
            color: colors.accentLight,
            '&.Mui-checked': { color: colors.accent },
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          root: { color: colors.accent },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: colors.accent },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            '&.Mui-selected, &:hover': { color: colors.accent },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          // A bar in the surface colour, rather than a block of accent
          // colour.
          root: {
            backgroundColor: colors.surface,
            backgroundImage: 'none',
            color: colors.line,
            borderBottom: `1px solid ${colors.water}`,
          },
        },
      },
      // The classic viewer's cards: a periwinkle frame, a little heavier
      // than the other themes' hairline.
      ...(isClassic && {
        MuiCard: {
          styleOverrides: {
            root: { borderWidth: '2px !important' },
          },
        },
      }),
    },
  });
};

// The palette as CSS variables, for awbColors and src/assets/styles.css -
// so the stylesheet and the theme can't drift apart.
const AppColorVariables = ({
  scheme,
}: {
  scheme: ColorScheme;
}): React.ReactElement => (
  <GlobalStyles
    styles={{
      ':root': {
        ...Object.fromEntries(
          Object.entries(palettes[scheme]).map(([key, value]) => [
            cssVariable(key as keyof AwbPalette),
            value,
          ]),
        ),
        '--awb-font-sans': sansFonts[scheme],
        '--awb-font-mono': monoFont,
        // Native scrollbars and form controls to match.
        colorScheme: scheme === 'dark' ? 'dark' : 'light',
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

const STORAGE_KEY = 'awb-color-scheme';

// The choice is this browser's own (it isn't part of a permalink). Classic,
// the original viewer's look, on a first visit - or when storage is blocked.
const readStoredScheme = (): ColorScheme => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return COLOR_SCHEMES.find((scheme) => scheme === stored) ?? 'classic';
  } catch {
    return 'classic';
  }
};

const storeScheme = (scheme: ColorScheme): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    // Not remembered then - it still applies until the page is reloaded.
  }
};

interface ColorSchemeContextValue {
  // The scheme in use: the user's choice, or else classic.
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
}

const ColorSchemeContext = React.createContext<ColorSchemeContextValue>({
  scheme: 'classic',
  setScheme: () => {},
});

export const useColorScheme = (): ColorSchemeContextValue =>
  React.useContext(ColorSchemeContext);

export const AppThemeProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const [scheme, setSchemeState] =
    React.useState<ColorScheme>(readStoredScheme);
  const theme = React.useMemo(() => createAppTheme(scheme), [scheme]);

  const setScheme = React.useCallback((next: ColorScheme): void => {
    setSchemeState(next);
    storeScheme(next);
  }, []);
  const value = React.useMemo(
    () => ({ scheme, setScheme }),
    [scheme, setScheme],
  );

  return (
    <ColorSchemeContext.Provider value={value}>
      <ThemeWrapper theme={theme}>
        <AppColorVariables scheme={scheme} />
        {children}
      </ThemeWrapper>
    </ColorSchemeContext.Provider>
  );
};
