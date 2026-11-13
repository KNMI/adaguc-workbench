import * as React from 'react';
import { LayerProps } from '@opengeoweb/webmap';
import {
  Button,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RefreshIcon from '@mui/icons-material/Refresh';
import { alpha } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import AutoWMSLayerDetailsDialog from './AutoWMSLayerDetailsDialog';
import AutoWMSServiceField from './autowms/AutoWMSServiceField';
import AutoWMSExplorerList from './autowms/AutoWMSExplorerList';
import AutoWMSLayerList from './autowms/AutoWMSLayerList';
import {
  AutoWMSItem,
  autoWMSListingKey,
  isWMSService,
  useAutoWMSListing,
  useWMSServiceContents,
  wmsServiceKey,
} from './autowms/autoWMSData';
import { AdagucAutoWMSServiceCommand } from '../../store/types';
import {
  forgetRecentService,
  getRecentServices,
  rememberRecentService,
} from '../../utils/recentServices';
import { fetchDefaultAutoWMSService } from '../../utils/defaultAutoWMSService';
import { resolveAutoWMSUrl } from '../../utils/resolveAutoWMSUrl';
import { useKeyedState } from '../../utils/useKeyedState';

const AUTOWMS_INPUT_DEBOUNCE_MS = 600;

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

// Browses an AutoWMS explorer service - its folders, then a dataset's (or
// a directly entered OGC WMS service's) layers, any of which can be added
// to the map. What's shown is derived from where the user is (service,
// path, selected dataset); the listings themselves come from React Query
// (see ./autowms/autoWMSData), keyed by exactly that.
const AutoWMS = ({
  addLayer,
  externalServiceRequest,
  isActive = true,
}: AutoWMSProps): React.ReactElement => {
  const queryClient = useQueryClient();
  const lowerCaseUrlParams = new URLSearchParams(window.location.search);
  const serviceFromQueryString =
    lowerCaseUrlParams.get('autowms') || lowerCaseUrlParams.get('wmsservice');

  // What is currently typed in the text field, updated on every keystroke.
  // Starts empty rather than straight from the ?autowms=/?wmsservice= url -
  // that url still gets loaded, but via loadAutoWMSService below (see the
  // mount effect further down), so it goes through the same AutoWMS url
  // resolution and remembering as one entered manually.
  const [autoWMSServiceInput, setAutoWMSServiceInput] = React.useState('');
  // The committed service url the explorer listing is for. Kept in sync
  // with autoWMSServiceInput after a short debounce while typing, or
  // immediately on Enter/Load, so we don't fire a request for every
  // keystroke (and for every half-typed url/port).
  const [autoWMSService, setAutoWMSService] = React.useState('');
  const [path, setPath] = React.useState('');
  // The selected dataset's path, if one is selected.
  const [currentLeaf, setCurrentLeaf] = React.useState('');
  // The OGC WMS service whose layers are shown: the selected dataset's, or
  // a WMS url entered directly.
  const [ogcWMSService, setOGCWMSService] = React.useState('');
  // Resolving a bare host to an AutoWMS endpoint (see loadAutoWMSService).
  const [isResolving, setIsResolving] = React.useState(false);
  const [detailsLayer, setDetailsLayer] = React.useState<LayerProps | null>(
    null,
  );
  // A filter left over from a previously shown folder/service would
  // otherwise silently hide items of the one just navigated into - each
  // filter belongs to what it filters.
  const [datasetFilter, setDatasetFilter] = useKeyedState(
    '',
    `${autoWMSService}\n${path}`,
  );
  const [layerFilter, setLayerFilter] = useKeyedState('', ogcWMSService);

  // Shared with WMSServiceInput (top bar / "Add data" dialog) via the same
  // localStorage-backed history, so a url typed in either place shows up
  // as a suggestion in both.
  const [recentServices, setRecentServices] = React.useState<string[]>(() =>
    getRecentServices(),
  );
  const [defaultAutoWMSService, setDefaultAutoWMSService] = React.useState<
    string | undefined
  >();

  const listing = useAutoWMSListing(autoWMSService, path);
  const wms = useWMSServiceContents(ogcWMSService);
  const { layers } = wms.contents;
  const isLoading = isResolving || listing.isFetching || wms.isFetching;

  // Reloads whichever is actually showing: a selected dataset's (or a
  // directly entered WMS url's) layers, or - only otherwise - the folder.
  const refresh = (): void => {
    if (isWMSService(autoWMSService) || currentLeaf.length > 0) {
      wms.refetch();
      return;
    }
    listing.refetch();
  };

  // Backs out one level: out of a selected dataset's layers, or one folder
  // segment up the explorer path - shared by the "Up one level" icon
  // button, its own full-width clone right under the header, and the
  // Backspace shortcut below, which all do exactly this.
  const goUpOneLevel = (): void => {
    if (isWMSService(autoWMSService)) {
      refresh();
      return;
    }
    setOGCWMSService('');
    if (currentLeaf.length > 0) {
      setCurrentLeaf('');
    } else {
      setPath(path.split('/').slice(0, -1).join('/'));
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

  // Loads a service right away, bypassing the typing debounce below - for
  // Enter/Load, an externally requested service, and the initial one.
  // Loading a service that's already shown fetches it again, rather than
  // just keeping what's cached.
  const loadAutoWMSService = (service: string): void => {
    setPath('');
    setCurrentLeaf('');
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
      void queryClient.invalidateQueries({ queryKey: wmsServiceKey(service) });
      return;
    }

    // Often just the bare host (e.g. a shared/bookmarked link, or someone
    // who doesn't know the exact mount path) - try it as given, then the
    // common AutoWMS mount points, before falling back to it verbatim so
    // the explorer still shows a clear "No items found" instead of
    // silently resolving to nothing.
    setIsResolving(true);
    resolveAutoWMSUrl(service)
      .then((resolved) => {
        const finalService = resolved ?? service;
        setAutoWMSServiceInput(finalService);
        setAutoWMSService(finalService);
        setRecentServices(rememberRecentService(finalService));
        void queryClient.invalidateQueries({
          queryKey: autoWMSListingKey(finalService),
        });
      })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error(e);
      })
      .finally(() => {
        setIsResolving(false);
      });
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
  // instead of on every keystroke. A typed AutoWMS service replaces
  // whatever dataset's layers were showing; a typed WMS url only takes
  // effect on Enter/Load.
  React.useEffect(() => {
    if (autoWMSServiceInput === autoWMSService) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setAutoWMSService(autoWMSServiceInput);
      if (
        !isWMSService(autoWMSServiceInput) &&
        autoWMSServiceInput.length >= 4
      ) {
        setOGCWMSService('');
      }
    }, AUTOWMS_INPUT_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [autoWMSServiceInput, autoWMSService]);

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
    // the suggestion list, regardless of what's actually loaded), but only
    // used to load something here when the url didn't already say
    // otherwise.
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

  const openDataset = (item: AutoWMSItem): void => {
    // A dataset without an ADAGUC WMS url has no layers to list.
    setOGCWMSService(item.adaguc ?? '');
    setCurrentLeaf(item.path);
  };

  const showsExplorerList = currentLeaf.length === 0 && layers.length === 0;
  // The folder listing's own error while it's what's shown, else the
  // service's (a directly entered WMS url's) one.
  const explorerError = ogcWMSService ? wms.error : listing.error;

  return (
    <div className="autowms_app_container">
      <AutoWMSServiceField
        value={autoWMSServiceInput}
        onChange={setAutoWMSServiceInput}
        onLoad={loadAutoWMSService}
        recentServices={recentServices}
        defaultService={defaultAutoWMSService}
        onForgetRecentService={(service) => {
          setRecentServices(forgetRecentService(service));
        }}
      />
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
                onClick={goUpOneLevel}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" aria-label="Refresh" onClick={refresh}>
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
          onClick={goUpOneLevel}
          sx={{
            borderRadius: 0,
            justifyContent: 'center',
            color: 'text.secondary',
          }}
        >
          Up one level
        </Button>
        {showsExplorerList && (
          <AutoWMSExplorerList
            items={listing.items}
            error={explorerError}
            isLoading={isLoading}
            filter={datasetFilter}
            onFilterChange={setDatasetFilter}
            onOpenFolder={(folderPath) => {
              setCurrentLeaf('');
              setPath(folderPath);
            }}
            onOpenDataset={openDataset}
          />
        )}
        {ogcWMSService.length > 0 && (
          <AutoWMSLayerList
            serviceUrl={ogcWMSService}
            abstract={wms.contents.abstract}
            layers={layers}
            // While a dataset is open the explorer list (which otherwise
            // shows this) is hidden.
            error={currentLeaf.length > 0 && !isLoading ? wms.error : null}
            filter={layerFilter}
            onFilterChange={setLayerFilter}
            onAddLayer={(layerName) => {
              addLayer(ogcWMSService, layerName);
            }}
            onShowDetails={setDetailsLayer}
          />
        )}
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
