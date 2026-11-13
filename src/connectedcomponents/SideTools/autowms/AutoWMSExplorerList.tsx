import * as React from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import DatasetIcon from '@mui/icons-material/Dataset';
import FolderIcon from '@mui/icons-material/Folder';
import { AutoWMSItem } from './autoWMSData';

// Splits a filter into words, each of which has to appear somewhere in the
// searched text - so "air press sea" finds "Air Pressure at Mean Sea
// Level", even though "press sea" never appears contiguously in it.
export const matchesFilter = (filter: string, searchableText: string) => {
  const tokens = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = searchableText.toLowerCase();
  return tokens.every((token) => text.includes(token));
};

interface FilterFieldProps {
  label: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export const FilterField = ({
  label,
  clearLabel,
  value,
  onChange,
}: FilterFieldProps): React.ReactElement => (
  <Box sx={{ px: 1.5, pt: 1.5 }}>
    <TextField
      fullWidth
      size="small"
      label={label}
      placeholder="e.g. temperature"
      variant="outlined"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      slotProps={{
        input: {
          endAdornment: value.length > 0 && (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label={clearLabel}
                onClick={() => {
                  onChange('');
                }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  </Box>
);

// Why something couldn't be listed - shown instead of an empty list, which
// otherwise looks identical whether the service is simply empty or isn't
// reachable at all (wrong host/port, service down, ...).
export const FetchErrorMessage = ({
  message,
}: {
  message: string;
}): React.ReactElement => (
  <Stack
    spacing={1}
    sx={{ alignItems: 'center', px: 2, py: 3, textAlign: 'center' }}
  >
    <CloudOffOutlinedIcon sx={{ fontSize: 40 }} color="disabled" />
    <Typography variant="body2" color="text.secondary">
      {message}
    </Typography>
  </Stack>
);

interface AutoWMSExplorerListProps {
  items: AutoWMSItem[];
  // Why the folder couldn't be listed, if it couldn't.
  error: string | null;
  isLoading: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenDataset: (item: AutoWMSItem) => void;
}

// One folder of the AutoWMS explorer: its subfolders and datasets.
const AutoWMSExplorerList = ({
  items,
  error,
  isLoading,
  filter,
  onFilterChange,
  onOpenFolder,
  onOpenDataset,
}: AutoWMSExplorerListProps): React.ReactElement => {
  const filteredItems = items.filter((item) =>
    matchesFilter(filter, item.name),
  );
  return (
    <>
      {items.length > 0 && (
        <FilterField
          label="Filter datasets"
          clearLabel="Clear dataset filter"
          value={filter}
          onChange={onFilterChange}
        />
      )}
      <List dense disablePadding>
        {error && !isLoading && <FetchErrorMessage message={error} />}
        {!error && items.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 1.5 }}
          >
            No items found.
          </Typography>
        )}
        {items.length > 0 && filteredItems.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 1.5 }}
          >
            No datasets match &quot;{filter}&quot;.
          </Typography>
        )}
        {filteredItems.map((item) => (
          <ListItemButton
            key={item.path + item.name}
            onClick={() => {
              if (item.leaf) {
                onOpenDataset(item);
              } else {
                onOpenFolder(item.path);
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {item.leaf ? (
                <DatasetIcon fontSize="small" color="action" />
              ) : (
                <FolderIcon fontSize="small" color="action" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={item.name}
              slotProps={{ primary: { variant: 'body2' } }}
            />
          </ListItemButton>
        ))}
      </List>
    </>
  );
};

export default AutoWMSExplorerList;
