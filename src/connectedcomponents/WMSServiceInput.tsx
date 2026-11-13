/* eslint-disable react/jsx-props-no-spreading */
import * as React from 'react';
import { Autocomplete, IconButton, TextField } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { actions, useAppDispatch } from '../store/store';
import { thunks } from '../store/thunks';
import {
  forgetRecentService,
  getRecentServices,
  rememberRecentService,
} from '../utils/recentServices';
import { fetchDefaultAutoWMSService } from '../utils/defaultAutoWMSService';
import { resolveAutoWMSUrl } from '../utils/resolveAutoWMSUrl';

// AutoWMS explorer endpoints (see AutoWMS.tsx) are plain file-listing
// services, not OGC WMS ones - a url naming "autowms" always opens the
// AutoWMS panel, and one with service=wms is always added as a map layer.
const isAutoWMSServiceUrl = (url: string): boolean => /autowms/i.test(url);
const isOGCWMSServiceUrl = (url: string): boolean =>
  url.toLocaleLowerCase().includes('service=wms');

export interface WMSServiceInputProps {
  // eslint-disable-next-line react/require-default-props
  placeholder?: string;
  // eslint-disable-next-line react/require-default-props
  sx?: SxProps<Theme>;
  // Called once the entered service has been successfully routed (added
  // as a layer, or opened in the AutoWMS panel) - lets a caller showing
  // this inside a dialog close it, for instance.
  // eslint-disable-next-line react/require-default-props
  onHandled?: () => void;
}

// A single "add a WMS or AutoWMS service" field, reused by both the top
// bar (AdagucAppBar) and the "Add data" dialog (AddDataComponent), so both
// get the same WMS/AutoWMS routing and recent-services history.
const WMSServiceInput = ({
  placeholder = 'Add a custom WMS or AutoWMS service',
  sx,
  onHandled,
}: WMSServiceInputProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const mapId = 'map1';

  const [value, setValue] = React.useState<string>('');
  const [recentServices, setRecentServices] = React.useState<string[]>(() =>
    getRecentServices(),
  );
  const [defaultAutoWMSService, setDefaultAutoWMSService] = React.useState<
    string | undefined
  >();
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchDefaultAutoWMSService().then(setDefaultAutoWMSService);
  }, []);

  const handleForgetRecentService = (service: string): void => {
    setRecentServices(forgetRecentService(service));
  };

  // The deployment's own default AutoWMS endpoint is always one click away
  // here, pinned first, rather than only suggested once it happens to
  // already be in the (locally-stored) recent-services history.
  const options = defaultAutoWMSService
    ? [
        defaultAutoWMSService,
        ...recentServices.filter(
          (service) => service !== defaultAutoWMSService,
        ),
      ]
    : recentServices;

  const submitService = (service: string): void => {
    if (!service) {
      return;
    }
    // Remembers whatever url actually ended up working - the resolved
    // AutoWMS url (e.g. with "/autowms" appended), not necessarily the
    // bare one typed, so the remembered entry is one that'll work again
    // next time without needing to be re-resolved.
    const finish = (resolvedService: string = service): void => {
      setRecentServices(rememberRecentService(resolvedService));
      setValue('');
      onHandled?.();
    };
    const addAsLayer = (): Promise<void> =>
      dispatch(thunks.addLayer({ mapId, serviceUrl: service, name: undefined }))
        .unwrap()
        .then(() => finish());

    if (isAutoWMSServiceUrl(service)) {
      dispatch(actions.requestAutoWMSService({ service }));
      finish();
      return;
    }
    if (isOGCWMSServiceUrl(service)) {
      addAsLayer().catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(e);
      });
      return;
    }

    // Neither a service=wms url nor one already naming "autowms" - rather
    // than assume, try the likely AutoWMS urls (see resolveAutoWMSUrl)
    // first, and only fall back to adding the originally typed url as a
    // WMS layer if none of those look like valid AutoWMS explorer data.
    resolveAutoWMSUrl(service)
      .then((autoWMSUrl) => {
        if (autoWMSUrl) {
          dispatch(actions.requestAutoWMSService({ service: autoWMSUrl }));
          finish(autoWMSUrl);
          return undefined;
        }
        return addAsLayer();
      })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(e);
      });
  };

  return (
    <Autocomplete
      freeSolo
      openOnFocus
      options={options}
      inputValue={value}
      onInputChange={(_event, newValue) => {
        setValue(newValue);
      }}
      // freeSolo's onChange already fires with the typed value on Enter,
      // the same as it does when an option is clicked - a separate
      // keydown handler here would submit it a second time.
      onChange={(_event, newValue) => {
        if (typeof newValue === 'string' && newValue) {
          submitService(newValue);
        }
      }}
      sx={sx}
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
            {option !== defaultAutoWMSService && (
              <IconButton
                size="small"
                aria-label={`Remove ${option} from recent services`}
                // The listbox selects an option on mousedown, before the
                // click this is actually waiting for ever fires - without
                // stopping it here too, clicking this button would select
                // (and submit) the option it's meant to delete instead.
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  handleForgetRecentService(option);
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
          placeholder={placeholder}
          variant="outlined"
          size="small"
        />
      )}
    />
  );
};

export default WMSServiceInput;
