import * as React from 'react';

import { Style, getWMLayerById } from '@opengeoweb/webmap';
import { openLayersGetMapImageStore } from '@opengeoweb/webmap-react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PlayIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
import DuplicateIcon from '@mui/icons-material/AddToPhotos';

import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import WMSDimensionSlider from '../WMSComponents/WMSDimensionSlider';
import WMSStyleSelector from '../WMSComponents/WMSStyleSelector';
import WMSLayerSelector from './WMSLayerSelector';
import { AdagucLayer } from '../../store/types';
import { CopyToClipBoard } from '../../connectedcomponents/CopyToClipBoard';
import { getDatasetNameFromServiceUrl } from '../../utils/getDatasetNameFromServiceUrl';
import { makeGoodServiceLink } from '../../utils/makeGoodServiceLink';
import {
  imageSrcBelongsToLayer,
  layerHasImageLoadError,
} from '../../utils/layerHasImageLoadError';

const makeGetCapabilitiesUrl = (serviceUrl: string): string =>
  `${makeGoodServiceLink(serviceUrl)}SERVICE=WMS&REQUEST=GetCapabilities`;

export interface LayerComponentProps {
  serviceUrl: string;
  layerIndex: number;
  layer: AdagucLayer;
  selectedStyleName: string;
  styles: Style[];
  isAnimating: boolean;
  onSelectLayer: (layerName: string) => void;
  openLayerDetails: (layerId: string) => void;
  onSelectStyle: (style: string) => void;
  onChangeLayerEnabled: (enabled: boolean) => void;
  onChangeOpacity: (opacity: number) => void;
  onDuplicate: () => void;
  getDimensionValue: (dimensionName: string) => string;
  setDimensionValue: (dimensionName: string, dimensionValue: string) => void;
  getDimensionLinked: (dimensionName: string) => boolean;
  setDimensionLinked: (dimensionName: string, linked: boolean) => void;
  removeLayer: () => void;
  layerToggleAnimation: () => void;
  zoomToLayer: () => void;
  update: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRefreshLayer: () => Promise<void>;
}
export const LayerComponent = ({
  serviceUrl,
  layer,
  onSelectLayer,
  openLayerDetails,
  onSelectStyle,
  onChangeLayerEnabled,
  onChangeOpacity,
  onDuplicate,
  selectedStyleName,
  styles,
  isAnimating,
  getDimensionValue,
  setDimensionValue,
  getDimensionLinked,
  setDimensionLinked,
  removeLayer,
  layerToggleAnimation,
  zoomToLayer,
  update: updateParent,
  layerIndex,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRefreshLayer,
}: LayerComponentProps): React.ReactElement<LayerComponentProps> => {
  const [count, setUpdate] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // How long this layer's last GetMap image request took, in ms - set by
  // TimeawareImageSource whenever a map pan/zoom/update triggers a new
  // request, outside of anything this component itself calls, so there's
  // no event to hook into here - poll the already-tracked value instead.
  const [lastGetMapDurationMs, setLastGetMapDurationMs] = React.useState<
    number | undefined
  >(undefined);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLastGetMapDurationMs(
        openLayersGetMapImageStore.loadDuration.getLoadDurationForId(layer.id),
      );
    }, 500);
    return () => {
      clearInterval(interval);
    };
  }, [layer.id]);

  // Detects the server for this layer going down *after* it was already
  // added and working (e.g. mid-session, while panning/stepping through
  // time) - as opposed to layer.hasError, which only reflects a failure
  // at add-layer time.
  //
  // This is driven by the image store's own load-completion events
  // (addImageEventCallback) rather than polling a snapshot of its cache:
  // a *polled* check (even one that tries to pick "the most recent"
  // cached image) can't reliably tell a genuine new request apart from
  // the store merely re-touching an old, no-longer-relevant cache entry
  // while looking for an alternative image to show during loading - both
  // bump the same bookkeeping a poll would have to rely on. The event
  // callback instead fires once per real completed load, in true
  // chronological order, for the exact WMImage that just finished - so
  // whichever request for this layer most recently actually completed is
  // always what decides the result, and the warning reliably clears the
  // moment a request succeeds again after the server comes back up.
  const [hasImageLoadError, setHasImageLoadError] = React.useState(false);
  React.useEffect(() => {
    setHasImageLoadError(
      layerHasImageLoadError(
        openLayersGetMapImageStore,
        getWMLayerById(layer.id),
      ),
    );
    const callbackId = `LayerComponent-image-error-${layer.id}`;
    const handleImageEvent: Parameters<
      typeof openLayersGetMapImageStore.addImageEventCallback
    >[0] = (image) => {
      if (!imageSrcBelongsToLayer(image.getSrc(), getWMLayerById(layer.id))) {
        return;
      }
      setHasImageLoadError(image.hasError());
    };
    openLayersGetMapImageStore.addImageEventCallback(
      handleImageEvent,
      callbackId,
    );
    return () => {
      openLayersGetMapImageStore.removeEventCallback(callbackId);
    };
  }, [layer.id]);

  const update = () => {
    updateParent();
    setUpdate((count + 1) % 10);
  };

  const handleRefreshLayer = (): void => {
    setIsRefreshing(true);
    onRefreshLayer()
      .then(() => {
        update();
      })
      .finally(() => {
        setIsRefreshing(false);
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.warn('Failed to refresh layer capabilities');
      });
  };
  const wmLayer = getWMLayerById(layer?.id);
  const cardTitle = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <CopyToClipBoard
        info={`layer title (${wmLayer?.title ?? ''})`}
        text={wmLayer?.title ?? ''}
      />
      <Box
        component="span"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        Layer {wmLayer?.title}
      </Box>
    </Box>
  );
  const datasetName = getDatasetNameFromServiceUrl(serviceUrl);
  const getCapabilitiesUrl = makeGetCapabilitiesUrl(serviceUrl);
  const cardSubTitle = (
    <>
      {datasetName && (
        <Box
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'text.secondary',
          }}
        >
          Dataset: <code>{datasetName}</code>
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <CopyToClipBoard info="GetCapabilities url" text={getCapabilitiesUrl} />
        <code>{getCapabilitiesUrl}</code>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <code>{layer?.name}</code>
      </Box>
    </>
  );

  const cardActions = (
    <Tooltip title="Remove this layer">
      <IconButton
        size="small"
        aria-label="Remove layer"
        onClick={() => {
          removeLayer();
        }}
        sx={{
          // Bleeds through the header's own padding (undone via the
          // negative margin on .MuiCardHeader-action below) so this spans
          // the header's full height edge-to-edge, rather than sitting as
          // a smaller button centered within it.
          height: '100%',
          width: 32,
          borderRadius: 0,
          bgcolor: (theme) => alpha(theme.palette.error.main, 0.12),
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.24),
          },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  // Floats over the card's own top-right corner rather than sitting
  // inline in the header's action row, so it reads as a badge on the
  // layer rather than just another toolbar icon - and can be bigger
  // without pushing the remove button around.
  const errorBadge = (layer?.hasError || hasImageLoadError) && (
    <Tooltip
      title={
        layer?.hasError
          ? 'Layer has an error'
          : "Server unreachable - could not load this layer's image"
      }
    >
      <WarningAmberIcon
        color="warning"
        sx={{
          position: 'absolute',
          // The card itself clips overflow (to keep the header/content's
          // rounded corners), so this sits just inside the top-right
          // corner rather than poking outside it.
          top: 4,
          right: 4,
          fontSize: 28,
          bgcolor: 'background.paper',
          borderRadius: '50%',
          boxShadow: 2,
          zIndex: 1,
        }}
      />
    </Tooltip>
  );

  // Both the header and the footer share this tint, so the card reads as
  // one unit with the (scrollable, variable-height) content sandwiched in
  // between - the header's default `-8px` action margin assumes the
  // Card's own roomier default padding, which this layout doesn't use, so
  // it's reset below to keep the close button from sitting outside the
  // header's visible bounds.
  const barSx = {
    bgcolor: (theme: import('@mui/material/styles').Theme) =>
      alpha(theme.palette.primary.main, 0.12),
  };

  return (
    <Card
      className="layercomponent_item"
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      {errorBadge}
      <CardHeader
        title={cardTitle}
        subheader={cardSubTitle}
        action={cardActions}
        slotProps={{
          title: {
            fontSize: '0.95rem',
            fontWeight: 600,
            // cardTitle now carries its own copy icon + truncation (see
            // its own definition above) rather than being plain text, so
            // Typography's own noWrap (meant for a single text node)
            // would otherwise just add conflicting overflow/white-space
            // rules on top of that.
            sx: { minWidth: 0 },
          },
          subheader: {
            fontSize: '0.8rem',
            component: 'div',
          },
        }}
        sx={{
          ...barSx,
          py: 1,
          pl: 1.5,
          pr: 0,
          alignItems: 'stretch',
          '& .MuiCardHeader-content': { minWidth: 0 },
          '& .MuiCardHeader-action': {
            margin: 0,
            ml: 1,
            // Cancels out the header's own py (top/bottom) so the action
            // slot - and so the remove button inside it, at height: 100%
            // - reaches all the way to the header's actual top/bottom
            // edges instead of stopping at the padded content box. The
            // card's own overflow: hidden + border-radius then clips the
            // button's square corner into the card's rounded one.
            my: -1,
            alignSelf: 'stretch',
            display: 'flex',
          },
        }}
      />
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <CopyToClipBoard
              info={`layer name (${layer?.name})`}
              text={layer?.name}
            />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <WMSLayerSelector
                layerName={layer?.name}
                serviceUrl={serviceUrl}
                onSelectLayer={(layerName) => {
                  onSelectLayer(layerName);
                  update();
                }}
              />
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <CopyToClipBoard
              info={`style name (${selectedStyleName}) for layer ${layer?.name}`}
              text={selectedStyleName}
            />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <WMSStyleSelector
                styleName={selectedStyleName}
                styles={styles}
                onSelectStyle={(styleName) => {
                  onSelectStyle(styleName);
                }}
              />
            </Box>
          </Stack>
          {getWMLayerById(layer?.id)?.dimensions.map((layerDimension) => {
            const dimensionValue = getDimensionValue(layerDimension.name);
            return (
              <Stack
                key={`${layer.name}${layerDimension.name}${layerIndex}`}
                direction="row"
                spacing={0.5}
                sx={{ alignItems: 'center' }}
              >
                <CopyToClipBoard
                  info={`${layerDimension.name} value (${dimensionValue}) for layer ${layer?.name}`}
                  text={dimensionValue}
                />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <WMSDimensionSlider
                    selectedDimensionValue={dimensionValue}
                    layerId={layer?.id}
                    onSelectDimensionValue={(value) => {
                      setDimensionValue(layerDimension.name, value);
                    }}
                    dimensionName={layerDimension.name}
                    linked={getDimensionLinked(layerDimension.name)}
                    onToggleLinked={(linked) => {
                      setDimensionLinked(layerDimension.name, linked);
                    }}
                  />
                </Box>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
      <Box
        sx={{
          ...barSx,
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          px: 1,
          py: 0.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tooltip title="Layer settings">
          <IconButton
            size="small"
            aria-label="Layer settings"
            onClick={() => {
              openLayerDetails(layer.id);
            }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Move layer up">
          <span>
            <IconButton
              size="small"
              aria-label="Move layer up"
              disabled={!canMoveUp}
              onClick={() => {
                onMoveUp();
              }}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Move layer down">
          <span>
            <IconButton
              size="small"
              aria-label="Move layer down"
              disabled={!canMoveDown}
              onClick={() => {
                onMoveDown();
              }}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Duplicate">
          <IconButton
            size="small"
            aria-label="Duplicate layer"
            onClick={() => {
              onDuplicate();
            }}
          >
            <DuplicateIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reload WMS capabilities for this layer">
          <span>
            <IconButton
              size="small"
              aria-label="Reload layer capabilities"
              disabled={isRefreshing}
              onClick={handleRefreshLayer}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Duration of this layer's last GetMap request">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ px: 0.5, whiteSpace: 'nowrap' }}
          >
            {lastGetMapDurationMs !== undefined
              ? `${lastGetMapDurationMs} ms`
              : '--- ms'}
          </Typography>
        </Tooltip>
        <Tooltip title="Play animation based on this layer">
          <IconButton
            size="small"
            aria-label={
              isAnimating ? 'Stop layer animation' : 'Play layer animation'
            }
            onClick={() => {
              layerToggleAnimation();
            }}
          >
            {isAnimating ? (
              <StopIcon fontSize="small" />
            ) : (
              <PlayIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Change opacity of this layer">
          <Slider
            value={(wmLayer?.opacity || 1) * 100}
            sx={{ flexGrow: 1, mx: 1.5 }}
            onChange={(e, value: number) => {
              // Looked up now rather than mutating the render-time wmLayer:
              // WMLayer is opengeoweb's own mutable object, updated in place.
              const target = getWMLayerById(layer?.id);
              if (target) {
                target.opacity = value / 100;
                onChangeOpacity(target.opacity);
                update();
              }
            }}
            size="small"
            min={0}
            max={100}
            orientation="horizontal"
          />
        </Tooltip>
        <Tooltip title="Enable/disable layer">
          <IconButton
            size="small"
            aria-label={
              getWMLayerById(layer?.id)?.enabled
                ? 'Disable layer'
                : 'Enable layer'
            }
            onClick={() => {
              const target = getWMLayerById(layer?.id);
              if (target) {
                target.enabled = !target.enabled;
                onChangeLayerEnabled(target.enabled);
                update();
              }
            }}
          >
            {getWMLayerById(layer?.id)?.enabled ? (
              <VisibilityIcon fontSize="small" />
            ) : (
              <VisibilityOffIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom to extent of this layer">
          <IconButton
            size="small"
            aria-label="Zoom to layer extent"
            onClick={() => {
              zoomToLayer();
            }}
          >
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  );
};
