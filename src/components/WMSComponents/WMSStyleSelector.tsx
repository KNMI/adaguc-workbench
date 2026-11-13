import * as React from 'react';
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Tooltip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Style } from '@opengeoweb/webmap';

interface WMSStyleSelectorProps {
  styleName: string;
  styles: Style[];
  onSelectStyle: (styleName: string) => void;
}

const WMSStyleSelector = ({
  styleName,
  styles,
  onSelectStyle,
}: WMSStyleSelectorProps): React.ReactElement<WMSStyleSelectorProps> => {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onSelectStyle(event.target.value);
  };

  const styleList = [...(styles && styles.length ? styles : [])];
  styleList.push({
    name: 'default',
    title: 'default',
    legendURL: '',
    abstract: '',
  });
  const selectedStyleName = styleName || styleList[0].name;
  const currentIndex = styleList.findIndex((l) => l.name === selectedStyleName);
  const canCycle = styleList.length > 1;

  // Cycles through the style list, wrapping around at either end.
  const goToStyleAtOffset = (offset: number): void => {
    if (!canCycle) {
      return;
    }
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      (baseIndex + offset + styleList.length) % styleList.length;
    onSelectStyle(styleList[nextIndex].name);
  };

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <FormControl size="small" sx={{ flexGrow: 1, minWidth: 0 }}>
        <InputLabel size="small">Style</InputLabel>
        <Select
          size="small"
          value={selectedStyleName}
          label="Style"
          onChange={handleChange}
          renderValue={() =>
            currentIndex !== -1
              ? `(${currentIndex + 1}/${styleList.length}) ${styleList[currentIndex].title}`
              : selectedStyleName
          }
        >
          {styleList.map((l, i) => (
            <MenuItem key={`${l.name}i${i}`} value={l.name}>
              {l.title} - {l.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Tooltip title="Previous style">
        <span>
          <IconButton
            size="small"
            aria-label="Previous style"
            disabled={!canCycle}
            onClick={() => {
              goToStyleAtOffset(-1);
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Next style">
        <span>
          <IconButton
            size="small"
            aria-label="Next style"
            disabled={!canCycle}
            onClick={() => {
              goToStyleAtOffset(1);
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default WMSStyleSelector;
