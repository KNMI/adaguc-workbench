import * as React from 'react';
import {
  Autocomplete,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import ArrowForwardSharp from '@mui/icons-material/ArrowForwardSharp';
import DeleteIcon from '@mui/icons-material/Delete';

interface AutoWMSServiceFieldProps {
  value: string;
  onChange: (value: string) => void;
  // Loads a service right away - picked from the suggestions, Enter, or
  // the Load button (which loads whatever is typed).
  onLoad: (service: string) => void;
  recentServices: string[];
  // This deployment's own default AutoWMS endpoint, if it has one.
  defaultService: string | undefined;
  onForgetRecentService: (service: string) => void;
}

// The service url field: free text, with recently used services (and the
// deployment default) as suggestions.
const AutoWMSServiceField = ({
  value,
  onChange,
  onLoad,
  recentServices,
  defaultService,
  onForgetRecentService,
}: AutoWMSServiceFieldProps): React.ReactElement => {
  // The deployment's own default AutoWMS endpoint is always one click away
  // here, pinned first, rather than only suggested once it happens to
  // already be in the (locally-stored) recent-services history.
  const options = defaultService
    ? [
        defaultService,
        ...recentServices.filter((service) => service !== defaultService),
      ]
    : recentServices;

  return (
    <Paper sx={{ m: 1, p: 1.5, borderRadius: 2 }}>
      <Stack direction="row" spacing={1}>
        <Autocomplete
          fullWidth
          freeSolo
          openOnFocus
          options={options}
          inputValue={value}
          onInputChange={(_event, newValue) => {
            onChange(newValue);
          }}
          // freeSolo's onChange already fires with the typed value on
          // Enter, the same as it does when an option is clicked - a
          // separate keydown handler here would load it a second time.
          onChange={(_event, newValue) => {
            if (typeof newValue === 'string' && newValue) {
              onLoad(newValue);
            }
          }}
          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
          renderOption={(optionProps, option) => {
            // MUI puts `key` in optionProps - spreading it alongside an
            // explicit `key` prop below would warn, so it's pulled out here.
            const { key, ...rest } = optionProps;
            return (
              <li
                key={key}
                {...rest}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {option}
                </span>
                {option !== defaultService && (
                  <IconButton
                    size="small"
                    aria-label={`Remove ${option} from recent services`}
                    // The listbox selects an option on mousedown, before
                    // the click this is actually waiting for ever fires -
                    // without stopping it here too, clicking this button
                    // would select (and load) the option it's meant to
                    // delete instead.
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onForgetRecentService(option);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Add AutoWMS or WMS service"
              variant="outlined"
            />
          )}
        />
        <Tooltip title="Load (you can also reference this via the ?autowms=<url> querystring in the browser location bar">
          <IconButton
            aria-label="Load service"
            onClick={() => {
              onLoad(value);
            }}
          >
            <ArrowForwardSharp />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

export default AutoWMSServiceField;
