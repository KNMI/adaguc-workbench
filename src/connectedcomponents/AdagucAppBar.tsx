import * as React from 'react';
import { AppBar, Box, IconButton, Toolbar, Tooltip } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SharePermalinkIcon from '@mui/icons-material/Share';
import PublicIcon from '@mui/icons-material/Public';
import AdagucAboutDialog from './AdagucAboutDialog';
import AdagucAddDataDialog from './AdagucAddDataDialog';
import AdagucCreatePermalinkDialog from './AdagucCreatePermalinkDialog';
import ColorSchemeButton from './ColorSchemeButton';
import PredefinedAreasDialog from './PredefinedAreasDialog';
import WMSServiceInput from './WMSServiceInput';

const AdagucAppBar = (): React.ReactElement => {
  const [addDataDialogOpen, setAddDataDialogOpen] =
    React.useState<boolean>(false);
  const [createLinkDialogOpen, setCreateLinkDialogOpen] =
    React.useState<boolean>(false);
  const [predefinedAreasDialogOpen, setPredefinedAreasDialogOpen] =
    React.useState<boolean>(false);
  const [aboutDialogOpen, setAboutDialogOpen] = React.useState<boolean>(false);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AdagucAddDataDialog
        isDialogOpen={addDataDialogOpen}
        onDialogOpen={setAddDataDialogOpen}
      />
      <AdagucCreatePermalinkDialog
        isDialogOpen={createLinkDialogOpen}
        onDialogOpen={setCreateLinkDialogOpen}
      />
      <PredefinedAreasDialog
        isDialogOpen={predefinedAreasDialogOpen}
        onDialogOpen={setPredefinedAreasDialogOpen}
      />
      <AdagucAboutDialog
        isDialogOpen={aboutDialogOpen}
        onDialogOpen={setAboutDialogOpen}
      />
      <AppBar position="static" elevation={0}>
        {/* Toolbar's default height comes from theme.mixins.toolbar, which
            sets its own minHeight at the "sm" breakpoint - a plain
            minHeight here has equal CSS specificity and can lose to that
            at desktop widths, leaving this bar shorter than intended (and
            the fixed-height header wrapper around it showing a gap below
            it). Repeating the override at "sm" too makes sure it wins at
            every size. */}
        <Toolbar sx={{ minHeight: { xs: '78px', sm: '78px' } }}>
          <WMSServiceInput
            sx={{
              flexGrow: 1,
              mr: 2,
              backgroundColor: 'background.paper',
              borderRadius: 1,
            }}
          />
          <Tooltip title="Predefined areas">
            <IconButton
              size="large"
              color="inherit"
              aria-label="Predefined areas"
              sx={{ mr: 1 }}
              onClick={() => {
                setPredefinedAreasDialogOpen(true);
              }}
            >
              <PublicIcon sx={{ fontSize: 28 }} />
            </IconButton>
          </Tooltip>
          <IconButton
            size="large"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            onClick={() => {
              setAddDataDialogOpen(true);
            }}
          >
            <MenuIcon sx={{ fontSize: 28 }} />
          </IconButton>
          <Tooltip title="Share permalink">
            <IconButton
              size="large"
              color="inherit"
              aria-label="Share permalink"
              sx={{ mr: 2 }}
              onClick={() => {
                setCreateLinkDialogOpen(true);
              }}
            >
              <SharePermalinkIcon sx={{ fontSize: 28 }} />
            </IconButton>
          </Tooltip>
          <ColorSchemeButton />
          <Tooltip title="About Adaguc Workbench (AWB)">
            <IconButton
              size="large"
              color="inherit"
              aria-label="About Adaguc Workbench"
              onClick={() => {
                setAboutDialogOpen(true);
              }}
            >
              <Box
                component="img"
                src="./adaguc-globe.png"
                alt="ADAGUC"
                sx={{ width: 28, height: 28 }}
              />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
    </Box>
  );
};

export default AdagucAppBar;
