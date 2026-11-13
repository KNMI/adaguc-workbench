import * as React from 'react';
import { LayerProps } from '@opengeoweb/webmap';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { CopyToClipBoard } from '../../CopyToClipBoard';
import {
  FetchErrorMessage,
  FilterField,
  matchesFilter,
} from './AutoWMSExplorerList';
import { capabilitiesUrl } from './autoWMSData';

const PREVIEW_SIZE_PX = 140;

// Caps how many new preview images start loading per second, so opening a
// service with many layers doesn't fire off a burst of GetMap requests all
// at once.
const MAX_PREVIEW_IMAGES_PER_SECOND = 5;

// Reveals (and so starts loading) at most MAX_PREVIEW_IMAGES_PER_SECOND
// new preview images per second, instead of all of them as soon as the
// layer list arrives. Starts over for a new list.
const useProgressiveRevealCount = (total: number, list: unknown): number => {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    setCount(Math.min(MAX_PREVIEW_IMAGES_PER_SECOND, total));
    if (total <= MAX_PREVIEW_IMAGES_PER_SECOND) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setCount((previous) => {
        const next = Math.min(previous + MAX_PREVIEW_IMAGES_PER_SECOND, total);
        if (next >= total) {
          window.clearInterval(intervalId);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [total, list]);
  return count;
};

interface AutoWMSLayerListProps {
  serviceUrl: string;
  abstract: string;
  layers: LayerProps[];
  // Why the service's layers couldn't be listed, if they couldn't.
  error: string | null;
  filter: string;
  onFilterChange: (filter: string) => void;
  onAddLayer: (layerName: string) => void;
  onShowDetails: (layer: LayerProps) => void;
}

// The layers of one WMS service, each with a preview - clicking a preview
// adds that layer to the map.
const AutoWMSLayerList = ({
  serviceUrl,
  abstract,
  layers,
  error,
  filter,
  onFilterChange,
  onAddLayer,
  onShowDetails,
}: AutoWMSLayerListProps): React.ReactElement => {
  const visiblePreviewCount = useProgressiveRevealCount(layers.length, layers);
  const wmsLink = capabilitiesUrl(serviceUrl);

  // Many services (e.g. SAT) list hundreds of layers - matching against
  // both title and name covers both "Temperature 2m" (title) and
  // "temperature-2m" (name) style searches. Each entry keeps its original
  // index (rather than the post-filter one), so the progressive preview
  // reveal - which counts up against the full, unfiltered list - still
  // lines up with which images have actually started loading.
  const filteredLayers = layers
    .map((layer, originalIndex) => ({ layer, originalIndex }))
    .filter(({ layer }) =>
      matchesFilter(filter, `${layer.title ?? ''} ${layer.name ?? ''}`),
    );

  return (
    <>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        {abstract && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {abstract}
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
      {error && <FetchErrorMessage message={error} />}
      {layers.length > 0 && (
        <FilterField
          label="Filter layers"
          clearLabel="Clear filter"
          value={filter}
          onChange={onFilterChange}
        />
      )}
      {layers.length > 0 && (
        <Stack spacing={1} sx={{ p: 1.5 }}>
          {filteredLayers.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ px: 0.5, py: 1 }}
            >
              No layers match &quot;{filter}&quot;.
            </Typography>
          )}
          {filteredLayers.map(({ layer, originalIndex }) => {
            const wmsImage = `${serviceUrl}&LAYERS=${layer.name}&WIDTH=${
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
                    if (layer.name) {
                      onAddLayer(layer.name);
                    }
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
                      onShowDetails(layer);
                    }}
                  >
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Paper>
            );
          })}
        </Stack>
      )}
    </>
  );
};

export default AutoWMSLayerList;
