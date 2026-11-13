import * as React from 'react';
import {
  LayerProps,
  queryWMSLayers,
  queryWMSServiceInfo,
} from '@opengeoweb/webmap';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowForwardSharp from '@mui/icons-material/ArrowForwardSharp';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DatasetIcon from '@mui/icons-material/Dataset';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import InfoIcon from '@mui/icons-material/Info';
import ClearIcon from '@mui/icons-material/Clear';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import { alpha } from '@mui/material/styles';
import { CopyToClipBoard } from '../CopyToClipBoard';
import AutoWMSLayerDetailsDialog from './AutoWMSLayerDetailsDialog';
import { AdagucAutoWMSServiceCommand } from '../../store/types';
import { makeGoodServiceLink } from '../../utils/makeGoodServiceLink';
import {
  forgetRecentService,
  getRecentServices,
  rememberRecentService,
} from '../../utils/recentServices';
import { fetchDefaultAutoWMSService } from '../../utils/defaultAutoWMSService';
import { resolveAutoWMSUrl } from '../../utils/resolveAutoWMSUrl';

const PREVIEW_SIZE_PX = 140;

const AUTOWMS_INPUT_DEBOUNCE_MS = 600;
// Caps how many new preview images start loading per second, so opening a
// service with many layers doesn't fire off a burst of GetMap requests all
// at once.
const MAX_PREVIEW_IMAGES_PER_SECOND = 5;

interface AutoWMSResult {
  result: { path: string; name: string; leaf: boolean; adaguc?: string }[];
}

interface AutoWMSProps {
  addLayer: (service: string, name: string) => void;
  // Set when the top bar's "custom WMS service" field (see AdagucAppBar)
  // is given a url that looks like an AutoWMS explorer endpoint rather
  // than a plain OGC WMS one - opens it here instead of adding it as a
  // layer.
  externalServiceRequest?: AdagucAutoWMSServiceCommand;
  // Whether this is the currently selected tab in the side tool panel -
  // this component stays mounted (just hidden) when another tab is
  // picked (see SideToolPanel), so the Backspace-to-go-up shortcut below
  // needs this to know not to fire while e.g. the Query tab is showing.
  // Defaults to true so standalone/test usage doesn't need to pass it.
  isActive?: boolean;
}

const isWMSService = (service: string): boolean => {
  return service?.toLocaleLowerCase().indexOf('service=wms') > 0 || false;
};

const isTextEntryElement = (element: Element | null): boolean => {
  if (!element) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    (element as HTMLElement).isContentEditable
  );
};

const AutoWMS = ({
  addLayer,
  externalServiceRequest,
  isActive = true,
}: AutoWMSProps): React.ReactElement => {
  const lowerCaseUrlParams = new URLSearchParams(window.location.search);

  const serviceFromQueryString =
    lowerCaseUrlParams.get('autowms') || lowerCaseUrlParams.get('wmsservice');

  const [result, setResult] = React.useState<AutoWMSResult>({ result: [] });
  const [path, changePath] = React.useState<string>('');
  const [isLoading, setLoading] = React.useState<boolean>(false);
  const [currentLeaf, changeLeaf] = React.useState<string>('');
  const [layers, setLayers] = React.useState<LayerProps[]>([]);
  const [wmsAbstract, setWMSAbstract] = React.useState<string>('');
  const [layerFilter, setLayerFilter] = React.useState<string>('');
  const [datasetFilter, setDatasetFilter] = React.useState<string>('');
  const [detailsLayer, setDetailsLayer] = React.useState<LayerProps | null>(
    null,
  );
  // Shared with WMSServiceInput (top bar / "Add data" dialog) via the same
  // localStorage-backed history, so a url typed in either place shows up
  // as a suggestion in both.
  const [recentServices, setRecentServices] = React.useState<string[]>(() =>
    getRecentServices(),
  );
  const [defaultAutoWMSService, setDefaultAutoWMSService] = React.useState<
    string | undefined
  >();
  const handleForgetRecentService = (service: string): void => {
    setRecentServices(forgetRecentService(service));
  };

  // What is currently typed in the text field, updated on every keystroke.
  // Starts empty rather than straight from the ?autowms=/?wmsservice= url -
  // that url still gets loaded, but via loadAutoWMSService below (see the
  // mount effect further down), so it goes through the same AutoWMS url
  // resolution and remembering as one entered manually.
  const [autoWMSServiceInput, setAutoWMSServiceInput] =
    React.useState<string>('');
  // The committed service url that actually drives fetching the AutoWMS
  // explorer listing. Kept in sync with autoWMSServiceInput after a short
  // debounce while typing, or immediately on Enter/Load, so we don't fire a
  // request for every keystroke (and for every half-typed url/port).
  const [autoWMSService, setAutoWMSService] = React.useState<string>('');
  const [ogcWMSService, setOGCWMSService] = React.useState<string>('');

  // Set when the most recent fetch (either the AutoWMS folder listing or an
  // OGC WMS GetCapabilities) failed outright - as opposed to succeeding
  // with zero results. Shown instead of "No items found.", which otherwise
  // looks identical whether the service is simply empty or isn't reachable
  // at all (wrong host/port, service down, ...), leaving no way to tell
  // the two apart.
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const handleError = (errorMessage: string): void => {
    // eslint-disable-next-line no-console
    console.error(errorMessage);
  };

  // Turns a fetch-chain rejection into a short, human-readable reason:
  // a TypeError is what fetch() itself rejects with for a network-level
  // failure (host unreachable, connection refused, DNS failure, CORS, ...),
  // while anything else is a message we raised ourselves (e.g. a non-OK
  // HTTP status) or an unexpected error from a dependency.
  const describeFetchError = (error: unknown): string =>
    error instanceof TypeError
      ? 'the service could not be reached'
      : (error as Error)?.message || 'an unexpected error occurred';

  // Guards against a stale AutoWMS listing response, the same way
  // ogcServiceRequestIdRef (below) guards the OGC WMS one: if this fires
  // again (a new path/service, or the same one re-requested - see
  // autoWMSFetchGeneration further down) before an earlier fetch here has
  // resolved, that earlier one's eventual result must not overwrite the
  // newer request's.
  const autoWMSRequestIdRef = React.useRef(0);

  const fetchAutoWMSList = (): void => {
    setFetchError(null);
    if (isWMSService(autoWMSService)) {
      return;
    }
    if (autoWMSService.length < 4) {
      return;
    }
    autoWMSRequestIdRef.current += 1;
    const requestId = autoWMSRequestIdRef.current;
    setResult({ result: [] });
    const subquery = 'request=getfiles&path=';
    const url = makeGoodServiceLink(autoWMSService) + subquery + path;
    setLayers([]);
    setOGCWMSService('');
    setLoading(true);
    fetch(url)
      .then((a) => {
        if (!a.ok) {
          throw new Error(`server responded with ${a.status} ${a.statusText}`);
        }
        return a.json();
      })
      .then((b) => {
        if (autoWMSRequestIdRef.current !== requestId) {
          return;
        }
        setResult(b);
      })
      .catch((e) => {
        if (autoWMSRequestIdRef.current !== requestId) {
          return;
        }
        handleError(e);
        setFetchError(`Could not reach ${url} - ${describeFetchError(e)}.`);
      })
      .finally(() => {
        if (autoWMSRequestIdRef.current !== requestId) {
          return;
        }
        setLoading(false);
      });
  };

  // Guards against a stale GetCapabilities response: if the service
  // changes (or clears) again before an earlier fetch resolves, that
  // fetch's result must not overwrite the newer state - otherwise
  // `layers` can end up populated from an old service while
  // `ogcWMSService` is already empty/different, and each layer's preview
  // image url (built as `${ogcWMSService}&LAYERS=...`) collapses to a bare
  // "&LAYERS=..." the browser then resolves against the current page.
  const ogcServiceRequestIdRef = React.useRef(0);

  const fetchLayersFromOGCWMSService = (): void => {
    setFetchError(null);
    ogcServiceRequestIdRef.current += 1;
    const requestId = ogcServiceRequestIdRef.current;
    if (ogcWMSService.length > 0) {
      const wmsLink = `${ogcWMSService}SERVICE=WMS&REQUEST=GetCapabilities`;
      setLayers([]);
      setLoading(true);
      Promise.all([queryWMSLayers(wmsLink, true), queryWMSServiceInfo(wmsLink)])
        .then(([_layers, serviceInfo]) => {
          if (ogcServiceRequestIdRef.current !== requestId) {
            return;
          }
          setLoading(false);
          setLayers(_layers);
          setWMSAbstract(serviceInfo.abstract);
        })
        .catch((f) => {
          if (ogcServiceRequestIdRef.current !== requestId) {
            return;
          }
          setLoading(false);
          handleError(f);
          setFetchError(
            `Could not reach ${ogcWMSService} - ${describeFetchError(f)}.`,
          );
        });
    } else {
      setLayers([]);
    }
  };

  // Bumped whenever loadAutoWMSService's non-WMS branch (or refresh, via
  // fetchAutoWMSList directly) actually commits a folder-listing service
  // to load. The folder-listing effect further down only re-fetches when
  // its own dependencies (path/autoWMSService) change value - but
  // loadAutoWMSService can resolve to the exact same value already in
  // state (e.g. re-entering or re-clicking a service that's already
  // loaded, such as this deployment's own config.json default), in which
  // case React bails out of re-running that effect entirely. Without
  // this, loadAutoWMSService's own synchronous setResult reset above
  // would clear the list but nothing would ever repopulate it - the
  // explorer gets stuck on "No items found" even though the service
  // loaded fine.
  //
  // Kept separate from wmsFetchGeneration below (rather than one shared
  // counter) deliberately: fetchAutoWMSList's own synchronous
  // setOGCWMSService('') reset (above) would otherwise also run every
  // time a leaf dataset is clicked (since that bumps the same counter
  // this effect depends on), clearing the layer service a moment after
  // the click handler just set it and cancelling its still-in-flight
  // GetCapabilities fetch via ogcServiceRequestIdRef's own stale-response
  // guard - i.e. clicking into a dataset would silently show nothing.
  const [autoWMSFetchGeneration, setAutoWMSFetchGeneration] = React.useState(0);
  // Same idea, for the OGC WMS GetCapabilities/layers listing - bumped by
  // loadAutoWMSService's WMS branch and by the leaf-dataset click handler
  // below.
  const [wmsFetchGeneration, setWmsFetchGeneration] = React.useState(0);

  // Reloads whichever is actually showing: a selected leaf dataset's (or a
  // directly-entered WMS url's) layers, or - only otherwise - the folder
  // listing. Deliberately never calls fetchAutoWMSList while a leaf/WMS
  // service is active: that function always resets ogcWMSService to '' as
  // part of navigating to a *different* folder, which here would instead
  // race fetchLayersFromOGCWMSService's own freshly-started request and
  // get it discarded by ogcServiceRequestIdRef's stale-response guard -
  // i.e. clicking refresh while viewing a dataset's layers silently left
  // the panel empty.
  const refresh = (): void => {
    if (isWMSService(autoWMSService) || currentLeaf.length > 0) {
      setWmsFetchGeneration((generation) => generation + 1);
      return;
    }
    setAutoWMSFetchGeneration((generation) => generation + 1);
  };

  // Backs out one level: out of a selected leaf dataset's layers, or one
  // folder segment up the explorer path - shared by the "Up one level"
  // icon button, its own full-width clone right under the header, and the
  // Backspace shortcut below, which all do exactly this.
  const goUpOneLevel = (): void => {
    if (isWMSService(autoWMSService)) {
      refresh();
      return;
    }
    setLayers([]);
    setOGCWMSService('');
    if (currentLeaf.length > 0) {
      changeLeaf('');
    } else {
      const pathItems = path.split('/');
      if (pathItems.length > 1) {
        pathItems.pop();
        changePath(pathItems.join('/'));
      } else {
        changePath('');
      }
    }
  };

  // An effect event, so the keydown listener below (which only needs to
  // be (re)attached when isActive changes) always calls the current
  // goUpOneLevel - that closure's own dependencies (path, currentLeaf,
  // autoWMSService, ...) change far more often than isActive does.
  const onGoUpOneLevelKey = React.useEffectEvent(() => {
    goUpOneLevel();
  });

  // Backspace, as a shortcut for the "Up one level" button above - but
  // not while the user is typing somewhere (a filter box, the service
  // url field, ...), where Backspace should just delete text as normal.
  // Only attached while this tab is actually the one showing: AutoWMS
  // stays mounted (just hidden) when another side-panel tab is selected
  // (see SideToolPanel), and Backspace is also the browser's own
  // "navigate back" shortcut outside of a text field in some browsers, so
  // this must not keep intercepting it once the user has moved on to
  // another tab.
  React.useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Backspace' ||
        isTextEntryElement(document.activeElement)
      ) {
        return;
      }
      event.preventDefault();
      onGoUpOneLevelKey();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  // Commits a service immediately, bypassing the debounce below, so the
  // Enter key/Load button (and an externally requested service, see below)
  // always fetch right away instead of waiting out a keystroke debounce
  // meant for typing.
  const loadAutoWMSService = (service: string): void => {
    setLayers([]);
    setResult({ result: [] });
    changePath('');
    changeLeaf('');
    setOGCWMSService('');
    setAutoWMSServiceInput(service);

    if (!service) {
      setAutoWMSService(service);
      return;
    }
    if (isWMSService(service)) {
      setAutoWMSService(service);
      setOGCWMSService(service);
      setRecentServices(rememberRecentService(service));
      setWmsFetchGeneration((generation) => generation + 1);
      return;
    }

    // Often just the bare host (e.g. a shared/bookmarked link, or someone
    // who doesn't know the exact mount path) - try it as given, then the
    // common AutoWMS mount points, before falling back to it verbatim so
    // the explorer still shows a clear "No items found" instead of
    // silently resolving to nothing.
    setLoading(true);
    resolveAutoWMSUrl(service)
      .then((resolved) => {
        const finalService = resolved ?? service;
        setAutoWMSServiceInput(finalService);
        setAutoWMSService(finalService);
        setRecentServices(rememberRecentService(finalService));
        setAutoWMSFetchGeneration((generation) => generation + 1);
      })
      .catch((e) => {
        handleError(e);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const fetchNewAutoWMS = (): void => {
    loadAutoWMSService(autoWMSServiceInput);
  };

  // The top bar's "custom WMS service" field can send a service here (see
  // AdagucAppBar/SideToolPanel) instead of adding it as a layer, when it
  // looks like an AutoWMS explorer url - load it the same way Enter/Load
  // would.
  const lastAppliedExternalRequestId = React.useRef<number>(0);
  // An effect event, so the effect below only re-runs for a new request,
  // while still calling the current render's loadAutoWMSService.
  const onExternalServiceRequest = React.useEffectEvent((service: string) => {
    loadAutoWMSService(service);
  });
  React.useEffect(() => {
    if (
      !externalServiceRequest ||
      externalServiceRequest.requestId === lastAppliedExternalRequestId.current
    ) {
      return;
    }
    lastAppliedExternalRequestId.current = externalServiceRequest.requestId;
    onExternalServiceRequest(externalServiceRequest.service);
  }, [externalServiceRequest]);

  // Debounce typing: only commit (and thus fetch) once the user pauses,
  // instead of on every keystroke.
  React.useEffect(() => {
    if (autoWMSServiceInput === autoWMSService) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setAutoWMSService(autoWMSServiceInput);
    }, AUTOWMS_INPUT_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [autoWMSServiceInput, autoWMSService]);

  const reloadAutoWMSList = React.useEffectEvent(() => {
    fetchAutoWMSList();
    // A filter left over from the previously browsed folder/service would
    // otherwise silently hide items of the one just navigated into.
    setDatasetFilter('');
  });
  // autoWMSFetchGeneration: see its own declaration above - needed so this
  // still re-fetches even when path/autoWMSService resolve to the same
  // value as before.
  React.useEffect(() => {
    reloadAutoWMSList();
  }, [path, autoWMSService, autoWMSFetchGeneration]);

  const reloadOGCWMSLayers = React.useEffectEvent(() => {
    fetchLayersFromOGCWMSService();
    // A filter left over from a previous service would otherwise silently
    // hide every layer of the newly loaded one.
    setLayerFilter('');
  });
  React.useEffect(() => {
    reloadOGCWMSLayers();
  }, [ogcWMSService, wmsFetchGeneration]);

  // Reveals (and so starts loading) at most MAX_PREVIEW_IMAGES_PER_SECOND
  // new preview images per second, instead of all of them as soon as the
  // layer list arrives.
  const [visiblePreviewCount, setVisiblePreviewCount] = React.useState(0);
  React.useEffect(() => {
    setVisiblePreviewCount(
      Math.min(MAX_PREVIEW_IMAGES_PER_SECOND, layers.length),
    );
    if (layers.length <= MAX_PREVIEW_IMAGES_PER_SECOND) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setVisiblePreviewCount((count) => {
        const next = Math.min(
          count + MAX_PREVIEW_IMAGES_PER_SECOND,
          layers.length,
        );
        if (next >= layers.length) {
          window.clearInterval(intervalId);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [layers]);

  // Loads whichever service the page should start with: one given via the
  // ?autowms=/?wmsservice= url, or - failing that - this deployment's own
  // configured default. Routing both through loadAutoWMSService (rather
  // than setting state directly) gives a url loaded this way the same
  // AutoWMS endpoint resolution and recent-services remembering as one
  // entered manually - without it, a bookmarked/shared link pointing at
  // just the bare host never resolved to anything, and was never
  // remembered as a suggestion for next time either.
  const loadInitialService = React.useEffectEvent(() => {
    if (serviceFromQueryString) {
      loadAutoWMSService(serviceFromQueryString);
    }
    // The deployment default is always fetched (it also pins an option in
    // the suggestion list below, regardless of what's actually loaded),
    // but only used to load something here when the url didn't already
    // say otherwise.
    void fetchDefaultAutoWMSService().then((defaultService) => {
      if (!defaultService) {
        return;
      }
      setDefaultAutoWMSService(defaultService);
      if (!serviceFromQueryString) {
        loadAutoWMSService(defaultService);
      }
    });
  });
  React.useEffect(() => {
    loadInitialService();
  }, []);

  // Matches the layer filter below: split into words and require each one
  // to appear somewhere in the item's name, rather than the whole query
  // matching as one literal substring.
  const datasetFilterTokens = datasetFilter
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filteredResultItems = (result?.result ?? []).filter((p) => {
    if (datasetFilterTokens.length === 0) {
      return true;
    }
    const searchableText = p.name.toLowerCase();
    return datasetFilterTokens.every((token) => searchableText.includes(token));
  });

  const datasetFilterBox = currentLeaf.length === 0 &&
    layers?.length === 0 &&
    result?.result?.length > 0 && (
      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          label="Filter datasets"
          placeholder="e.g. temperature"
          variant="outlined"
          value={datasetFilter}
          onChange={(e) => {
            setDatasetFilter(e.target.value);
          }}
          slotProps={{
            input: {
              endAdornment: datasetFilter.length > 0 && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear dataset filter"
                    onClick={() => {
                      setDatasetFilter('');
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

  const autowmsExplorerList = currentLeaf.length === 0 &&
    layers?.length === 0 && (
      <List dense disablePadding>
        {fetchError && !isLoading && (
          <Stack
            spacing={1}
            sx={{ alignItems: 'center', px: 2, py: 3, textAlign: 'center' }}
          >
            <CloudOffOutlinedIcon sx={{ fontSize: 40 }} color="disabled" />
            <Typography variant="body2" color="text.secondary">
              {fetchError}
            </Typography>
          </Stack>
        )}
        {!fetchError && result?.result?.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 1.5 }}
          >
            No items found.
          </Typography>
        )}
        {result?.result?.length > 0 && filteredResultItems.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 1.5 }}
          >
            No datasets match &quot;{datasetFilter}&quot;.
          </Typography>
        )}
        {filteredResultItems.map((p) => (
          <ListItemButton
            key={p.path + p.name}
            onClick={() => {
              if (p.leaf !== true) {
                changeLeaf('');
                changePath(p.path);
              } else {
                setOGCWMSService(p.adaguc);
                changeLeaf(p.path);
                // Re-clicking the same already-loaded dataset wouldn't
                // otherwise change ogcWMSService's value, so the effect
                // that fetches its layers would never re-run - see
                // wmsFetchGeneration's own declaration above.
                setWmsFetchGeneration((generation) => generation + 1);
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {p.leaf ? (
                <DatasetIcon fontSize="small" color="action" />
              ) : (
                <FolderIcon fontSize="small" color="action" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={p.name}
              slotProps={{ primary: { variant: 'body2' } }}
            />
          </ListItemButton>
        ))}
      </List>
    );

  const wmsLink = `${ogcWMSService}SERVICE=WMS&REQUEST=GetCapabilities`;
  const autowmsWMSServiceHeader = ogcWMSService?.length > 0 && (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      {wmsAbstract && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {wmsAbstract}
        </Typography>
      )}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Chip size="small" label="WMS" variant="outlined" />
        <CopyToClipBoard info="WMS Service link" text={wmsLink} />
        <Typography
          component="a"
          variant="body2"
          href={wmsLink}
          target="_blank"
          rel="noreferrer"
          sx={{ color: 'primary.main', wordBreak: 'break-all' }}
        >
          {wmsLink}
        </Typography>
      </Stack>
    </Box>
  );

  // Many services (e.g. SAT) list hundreds of layers - matching against
  // both title and name covers both "Temperature 2m" (title) and
  // "temperature-2m" (name) style searches. Split into words and require
  // each one to appear SOMEWHERE in the title/name (not the whole query as
  // one literal substring), so "air press sea" finds "Air Pressure at Mean
  // Sea Level" even though "press sea" never appears contiguously in that
  // title. Keeping each entry's original index (rather than the
  // post-filter one) means the progressive-preview-reveal effect below -
  // which only ever counts up against the full, unfiltered list - still
  // lines up with which images have actually started loading.
  const filterTokens = layerFilter
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const filteredLayers = layers
    .map((layer, originalIndex) => ({ layer, originalIndex }))
    .filter(({ layer }) => {
      if (filterTokens.length === 0) {
        return true;
      }
      const searchableText =
        `${layer.title ?? ''} ${layer.name ?? ''}`.toLowerCase();
      return filterTokens.every((token) => searchableText.includes(token));
    });

  const layerFilterBox = layers?.length > 0 && (
    <Box sx={{ px: 1.5, pt: 1.5 }}>
      <TextField
        fullWidth
        size="small"
        label="Filter layers"
        placeholder="e.g. temperature"
        variant="outlined"
        value={layerFilter}
        onChange={(e) => {
          setLayerFilter(e.target.value);
        }}
        slotProps={{
          input: {
            endAdornment: layerFilter.length > 0 && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="Clear filter"
                  onClick={() => {
                    setLayerFilter('');
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

  const autowmsWMSService = layers?.length > 0 && (
    <Stack spacing={1} sx={{ p: 1.5 }}>
      {filteredLayers.length === 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ px: 0.5, py: 1 }}
        >
          No layers match &quot;{layerFilter}&quot;.
        </Typography>
      )}
      {filteredLayers.map(({ layer, originalIndex }) => {
        const wmsImage = `${ogcWMSService}&LAYERS=${layer.name}&WIDTH=${
          PREVIEW_SIZE_PX * 2
        }&HEIGHT=${
          PREVIEW_SIZE_PX * 2
        }&SERVICE=WMS&request=GETMAP&format=image/webp&CRS=EPSG:4326`;
        return (
          <Paper
            key={wmsImage}
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1,
              borderRadius: 2,
            }}
          >
            <Box
              onClick={() => {
                addLayer(ogcWMSService, layer.name);
              }}
              onKeyDown={() => {}}
              role="button"
              tabIndex={0}
              aria-label={`Add ${layer.title} to the map`}
              sx={{
                flexShrink: 0,
                width: PREVIEW_SIZE_PX,
                height: PREVIEW_SIZE_PX,
                borderRadius: 1.5,
                overflow: 'hidden',
                cursor: 'pointer',
                bgcolor: 'background.default',
              }}
            >
              {originalIndex < visiblePreviewCount ? (
                <img
                  src={wmsImage}
                  alt={layer.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <Skeleton
                  variant="rectangular"
                  width={PREVIEW_SIZE_PX}
                  height={PREVIEW_SIZE_PX}
                />
              )}
            </Box>
            <Stack spacing={0.5} sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="subtitle2" noWrap>
                {layer.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ fontFamily: 'monospace' }}
              >
                {layer.name}
              </Typography>
            </Stack>
            <Tooltip title="Layer details">
              <IconButton
                size="small"
                aria-label="Layer details"
                onClick={() => {
                  setDetailsLayer(layer);
                }}
              >
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Paper>
        );
      })}
    </Stack>
  );

  // The deployment's own default AutoWMS endpoint is always one click away
  // here, pinned first, rather than only suggested once it happens to
  // already be in the (locally-stored) recent-services history.
  const autoWMSOptions = defaultAutoWMSService
    ? [
        defaultAutoWMSService,
        ...recentServices.filter(
          (service) => service !== defaultAutoWMSService,
        ),
      ]
    : recentServices;

  return (
    <div className="autowms_app_container">
      <Paper sx={{ m: 1, p: 1.5, borderRadius: 2 }}>
        <Stack direction="row" spacing={1}>
          <Autocomplete
            fullWidth
            freeSolo
            openOnFocus
            options={autoWMSOptions}
            inputValue={autoWMSServiceInput}
            onInputChange={(_event, newValue) => {
              setAutoWMSServiceInput(newValue);
            }}
            // freeSolo's onChange already fires with the typed value on
            // Enter, the same as it does when an option is clicked - a
            // separate keydown handler here would load it a second time.
            onChange={(_event, newValue) => {
              if (typeof newValue === 'string' && newValue) {
                loadAutoWMSService(newValue);
              }
            }}
            sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
            renderOption={(optionProps, option) => {
              // MUI puts `key` in optionProps - spreading it alongside an
              // explicit `key` prop below would warn, so it's pulled out
              // here.
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
                fetchNewAutoWMS();
              }}
            >
              <ArrowForwardSharp />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>
      <Paper sx={{ mx: 1, mb: 1, borderRadius: 2, overflow: 'hidden' }}>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 1,
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{ fontFamily: 'monospace', minWidth: 0 }}
          >
            {/* currentLeaf (like path) is always a full path from the
                root, not a bare filename to append to path - showing both
                together would double up the parent segments. */}
            Current path: {currentLeaf || path}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Tooltip title="Up one level">
              <IconButton
                size="small"
                aria-label="Up one level"
                onClick={() => {
                  goUpOneLevel();
                }}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton
                size="small"
                aria-label="Refresh"
                onClick={() => {
                  refresh();
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Button
          fullWidth
          size="small"
          aria-label="Up one level (full width)"
          startIcon={<ArrowUpwardIcon fontSize="small" />}
          onClick={() => {
            goUpOneLevel();
          }}
          sx={{
            borderRadius: 0,
            justifyContent: 'center',
            color: 'text.secondary',
          }}
        >
          Up one level
        </Button>
        {datasetFilterBox}
        {autowmsExplorerList}
        {autowmsWMSServiceHeader}
        {layerFilterBox}
        {autowmsWMSService}
        {isLoading && <LinearProgress />}
      </Paper>
      <AutoWMSLayerDetailsDialog
        serviceUrl={ogcWMSService}
        layer={detailsLayer}
        onClose={() => {
          setDetailsLayer(null);
        }}
      />
    </div>
  );
};

export default AutoWMS;
