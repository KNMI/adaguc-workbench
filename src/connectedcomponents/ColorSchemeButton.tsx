import * as React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { createSvgIcon } from '@mui/material/utils';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { ColorScheme, useColorScheme } from '../application/appTheme';

// The ADAGUC logo (three circles nested so they touch at the bottom: blue,
// yellow and green) in one colour, like the sun and moon - each circle a
// little stronger than the one around it.
const AdagucClassicIcon = createSvgIcon(
  <>
    <circle cx="12" cy="12" r="10" opacity="0.3" />
    <circle cx="12" cy="14.5" r="7.5" opacity="0.55" />
    <circle cx="12" cy="17" r="5" />
  </>,
  'AdagucClassic',
);

// Steps through the light, dark and classic themes - showing the current
// one (a sun, a moon, or the ADAGUC logo for the original viewer's look),
// and saying what a click switches to.
const STEPS: Record<
  ColorScheme,
  { next: ColorScheme; label: string; icon: React.ReactElement }
> = {
  light: {
    next: 'dark',
    label: 'Switch to dark theme',
    icon: <LightModeIcon sx={{ fontSize: 28 }} />,
  },
  dark: {
    next: 'classic',
    label: 'Switch to classic theme',
    icon: <DarkModeIcon sx={{ fontSize: 28 }} />,
  },
  classic: {
    next: 'light',
    label: 'Switch to light theme',
    icon: <AdagucClassicIcon sx={{ fontSize: 28 }} />,
  },
};

const ColorSchemeButton = (): React.ReactElement => {
  const { scheme, setScheme } = useColorScheme();
  const { next, label, icon } = STEPS[scheme];

  return (
    <Tooltip title={label}>
      <IconButton
        size="large"
        color="inherit"
        aria-label={label}
        sx={{ mr: 2 }}
        onClick={() => {
          setScheme(next);
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
};

export default ColorSchemeButton;
