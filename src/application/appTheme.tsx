import * as React from 'react';
import { GlobalStyles, useMediaQuery } from '@mui/material';
import { createTheme, Theme } from '@mui/material/styles';
import { darkTheme, lightTheme, ThemeWrapper } from '@opengeoweb/theme';

interface AwbPalette {
  // Cards, fields and other surfaces.
  surface: string;
  // Panel backgrounds.
  panel: string;
  // Header strips and other quiet fills.
  water: string;
  // Hover on those fills, and table/divider lines.
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

export type ColorScheme = 'light' | 'dark';

// The viewer's colours, taken from its default base map ("KNMI Basemap
// Light Grey Canvas"): its warm off-white land, its blue-grey water, and
// the dark grey of its borders - with a muted slate blue, a darker shade
// of that same water, as the one accent colour for anything interactive.
// Dark mode keeps the same slate family, with the light and dark ends
// swapped. Data colours (chart series, layer styles) are deliberately left
// alone, and so is the map itself: the base map is whatever the user picks.
const palettes: Record<ColorScheme, AwbPalette> = {
  light: {
    surface: '#fafaf9',
    panel: '#eef0f1',
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
    water: '#2e363b',
    waterDark: '#3d474d',
    line: '#e2e6e8',
    accent: '#93aabb',
    accentDark: '#b2c4d1',
    accentLight: '#5e7484',
    onAccent: '#11161a',
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

// One typeface for the whole app; the monospaced one only for raw text
// dumps (JSON, ncdump output).
export const awbFonts = {
  sans: '"Roboto", "Helvetica", "Arial", sans-serif',
  mono: '"Roboto Mono", "Menlo", "Consolas", monospace',
};

// opengeoweb's light or dark theme (which the rest of its components are
// styled for) with this palette on top - it sets no accent colour of its
// own, so buttons, sliders, tabs and the top bar otherwise fall back to
// MUI's default bright blue.
export const createAppTheme = (scheme: ColorScheme): Theme => {
  const colors = palettes[scheme];
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
        '--awb-font-sans': awbFonts.sans,
        '--awb-font-mono': awbFonts.mono,
        // Native scrollbars and form controls to match.
        colorScheme: scheme,
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

// The choice is this browser's own (it isn't part of a permalink). Until one
// is made - or when storage is blocked - the system setting decides.
const readStoredScheme = (): ColorScheme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
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
  // The scheme in use: the user's choice, or else the system's.
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
}

const ColorSchemeContext = React.createContext<ColorSchemeContextValue>({
  scheme: 'light',
  setScheme: () => {},
});

export const useColorScheme = (): ColorSchemeContextValue =>
  React.useContext(ColorSchemeContext);

export const AppThemeProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const [chosenScheme, setChosenScheme] = React.useState<ColorScheme | null>(
    readStoredScheme,
  );
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true,
  });
  const scheme: ColorScheme =
    chosenScheme ?? (systemPrefersDark ? 'dark' : 'light');
  const theme = React.useMemo(() => createAppTheme(scheme), [scheme]);

  const setScheme = React.useCallback((next: ColorScheme): void => {
    setChosenScheme(next);
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
