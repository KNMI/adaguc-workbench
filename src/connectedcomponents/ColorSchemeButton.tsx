import * as React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useColorScheme } from '../application/appTheme';

// Switches between the light and the dark theme - a sun while light, a moon
// while dark.
const ColorSchemeButton = (): React.ReactElement => {
  const { scheme, setScheme } = useColorScheme();
  const isDark = scheme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Tooltip title={label}>
      <IconButton
        size="large"
        color="inherit"
        aria-label={label}
        sx={{ mr: 2 }}
        onClick={() => {
          setScheme(isDark ? 'light' : 'dark');
        }}
      >
        {isDark ? (
          <DarkModeIcon sx={{ fontSize: 28 }} />
        ) : (
          <LightModeIcon sx={{ fontSize: 28 }} />
        )}
      </IconButton>
    </Tooltip>
  );
};

export default ColorSchemeButton;
