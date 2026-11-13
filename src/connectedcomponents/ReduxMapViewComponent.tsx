import * as React from 'react';
import { View } from 'ol';
import { get as getOlProjection } from 'ol/proj';
import { debounce } from 'lodash';
import { Tooltip } from '@mui/material';
import { LayerType } from '@opengeoweb/webmap';
import { getWMLayer } from '../utils/getWMLayer';
import {
  OpenLayersMapView,
  OpenLayersLayer,
  OpenLayersGetFeatureInfo,
  getLayerExtentForProjection,
  makeView,
  MapLocation,
} from '@opengeoweb/webmap-react';
import { actions, useAppDispatch, useAppSelector } from '../store/store';
import { selectors } from '../store/selectors';
import {
  AdagucMap,
  AdagucBaseLayer,
  AdagucLayer,
  AdagucMapView,
  ViewerState,
} from '../store/types';
import { ReduxMapLayer } from './ReduxMapLayer';
import { AnimationClock, AnimationTick } from './AnimationClock';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import OpenLayersHistogramBoxSelect from './OpenLayersHistogramBoxSelect';
import { registerExtraProjections } from '../utils/registerExtraProjections';
import { fitViewToBbox } from '../utils/fitViewToBbox';
import { isLayerInAnimation } from '../store/animation';

registerExtraProjections();

export interface ReduxMapViewComponentProps {
  mapId: string;
}

// The layer list shows the topmost-drawn layer first, so it needs the
// highest zIndex. Base layers get a large negative range (so any number of
// Baselayers-tab presets - see baseLayerPresets.ts - always stay below 0),
// data layers start at 1, and overlays get a large positive range, safely
// above however many data layers there are.
const BASE_LAYER_BASE_ZINDEX = -1000;
const DATA_LAYER_BASE_ZINDEX = 1;
const OVERLAY_BASE_ZINDEX = 10000;

// A plain DOM child here renders on top of the map canvas (the same way
// OpenLayersMapView's own MapMousePosition overlay does) - bottom-right is
// free of any other overlay (MapMousePosition sits bottom-left), so the
// watermark can't end up covering/covered by it.
const Watermark = (): React.ReactElement => (
  <div
    style={{
      position: 'absolute',
      right: 8,
      bottom: 8,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 4,
      background: 'rgba(255, 255, 255, 0.65)',
      color: 'rgba(0, 0, 0, 0.6)',
      fontSize: 11,
      lineHeight: 1.4,
      pointerEvents: 'none',
      userSelect: 'none',
    }}
  >
    <Tooltip title="Adaguc Workbench (AWB)">
      <img
        src="./adaguc-globe.png"
        alt=""
        // The watermark itself ignores pointer events so it never blocks
        // clicking/panning the map underneath - re-enable them on just the
        // icon so hovering it can still show this tooltip.
        style={{ width: 14, height: 14, pointerEvents: 'auto' }}
      />
    </Tooltip>
    KNMI Adaguc Workbench
  </div>
);

export const ReduxMapViewComponent = ({
  mapId,
}: ReduxMapViewComponentProps): React.ReactElement<ReduxMapViewComponentProps> => {
  const dispatch = useAppDispatch();
  const mapLayers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const baseLayers = useAppSelector(
    (state: ViewerState): AdagucBaseLayer[] => state?.viewer?.baseLayers,
  );
  const mapView = useAppSelector(
    (state: ViewerState): AdagucMapView => state?.viewer?.maps[mapId]?.view,
  );
  const viewCommand = useAppSelector(
    (state: ViewerState) => state?.viewer?.maps[mapId]?.viewCommand,
  );
  const zoomToLayerCommand = useAppSelector(
    (state: ViewerState) => state?.viewer?.maps[mapId]?.zoomToLayerCommand,
  );
  const isGetFeatureInfoActive = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.maps[mapId]?.isGetFeatureInfoActive,
  );
  const isAnimating = useAppSelector(
    (state: ViewerState): boolean => state?.viewer?.maps[mapId]?.isAnimating,
  );
  const map = useAppSelector(
    (state: ViewerState): AdagucMap | undefined => state?.viewer?.maps[mapId],
  );
  const mapPinLocation = useAppSelector(
    (state: ViewerState): MapLocation | undefined =>
      state?.viewer?.maps[mapId]?.mapPinLocation,
  );
  const isHistogramBoxSelectActive = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.maps[mapId]?.isHistogramBoxSelectActive,
  );

  // Each animated layer used to run its own independent useAnimationForLayer
  // timer; since those aren't synchronised with each other, layers visibly
  // updated at slightly different moments. Driving every animated layer
  // from a single shared tick (produced by one AnimationClock) keeps them in
  // lockstep, since they all then re-render from the same state update.
  // The clock steps through the time values of the layer whose Play was
  // pressed (falling back to the topmost layer with a time dimension).
  const animationClockLayer =
    mapLayers.find((layer) => layer.id === map?.animation?.layerId) ??
    mapLayers.find((layer) => getWMLayer(layer.id)?.getDimension('time'));
  const [animationTick, setAnimationTick] =
    React.useState<AnimationTick | null>(null);

  // Drop any tick left over from the previous run, so a fresh AnimationClock
  // mount (keyed below) starts every layer from a clean, untouched state
  // instead of one frame of the old animation.
  React.useEffect(() => {
    if (!isAnimating) {
      setAnimationTick(null);
    }
  }, [isAnimating]);

  const [view, setView] = React.useState<View>(() =>
    makeView(mapView?.srs || 'EPSG:3857'),
  );
  const lastAppliedViewCommandId = React.useRef<number>(0);
  const lastAppliedZoomCommandId = React.useRef<number>(0);
  const pendingFitBbox = React.useRef<AdagucMapView['bbox'] | null>(null);

  // Reads the view directly (rather than waiting for its 'change' event)
  // so a fit triggered here is reflected in redux - and so the permalink -
  // immediately, instead of only if something later happens to also pan or
  // zoom the map (see callers below for why 'change' alone isn't enough).
  const syncViewToRedux = React.useCallback(
    (viewToSync: View): void => {
      try {
        const extent = viewToSync.calculateExtent();
        dispatch(
          actions.updateMapView({
            mapId,
            view: {
              srs: viewToSync.getProjection().getCode(),
              bbox: {
                left: extent[0],
                bottom: extent[1],
                right: extent[2],
                top: extent[3],
              },
            },
          }),
        );
      } catch {
        // View size is not known yet, nothing to sync.
      }
    },
    [mapId, dispatch],
  );

  React.useEffect(() => {
    if (
      !viewCommand ||
      viewCommand.requestId === lastAppliedViewCommandId.current
    ) {
      return;
    }
    lastAppliedViewCommandId.current = viewCommand.requestId;
    // OpenLayers can only build a View for an srs proj4 has a definition
    // for (see registerExtraProjections) - for any other, makeView throws
    // and takes the whole app down. A layer's projection table lists
    // whatever its GetCapabilities advertises, and a permalink can carry any
    // srs at all, so keep the current view rather than crash.
    if (!getOlProjection(viewCommand.srs)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Projection ${viewCommand.srs} is not supported by this viewer; keeping the current projection.`,
      );
      return;
    }
    // Fitting the extent here, before this view is attached to the map,
    // would use the view's default (and wrong) assumed viewport size of
    // 100x100 - defer it to the effect below instead, which (as a parent
    // effect) runs after OpenLayersMapView's own effect has attached this
    // view to the map via map.setView(), which is what gives it its real
    // size.
    pendingFitBbox.current = viewCommand.bbox;
    setView(makeView(viewCommand.srs));
  }, [viewCommand]);

  React.useEffect(() => {
    if (!pendingFitBbox.current) {
      return;
    }
    fitViewToBbox(view, pendingFitBbox.current);
    pendingFitBbox.current = null;
    // Fitting above can itself fire the view's 'change' event before the
    // listener effect further below (declared after this one, so it
    // subscribes later in this same commit) has attached to this new
    // view - that fires are missed, and without a later pan/zoom nothing
    // else would tell redux (and so the permalink) that the projection
    // actually changed, even though the map itself already shows it
    // correctly (it reads the live OL view directly, not redux). Sync it
    // here explicitly instead of only ever relying on a future 'change'.
    syncViewToRedux(view);
  }, [view, syncViewToRedux]);

  React.useEffect(() => {
    if (
      !zoomToLayerCommand ||
      zoomToLayerCommand.requestId === lastAppliedZoomCommandId.current
    ) {
      return;
    }
    lastAppliedZoomCommandId.current = zoomToLayerCommand.requestId;
    const wmLayer = getWMLayer(zoomToLayerCommand.layerId);
    const extent =
      wmLayer &&
      getLayerExtentForProjection(wmLayer, view.getProjection().getCode());
    if (extent) {
      // view.fit() fires 'change' synchronously - same race as the
      // pendingFitBbox effect above, so this needs the same explicit sync
      // rather than relying on the debounced listener further below:
      // without it, the map visibly zooms to the layer but redux (and so
      // the permalink) keeps advertising the view from before the zoom.
      view.fit(extent);
      syncViewToRedux(view);
    }
  }, [zoomToLayerCommand, view, syncViewToRedux]);

  React.useEffect(() => {
    const onViewChange = debounce(() => syncViewToRedux(view), 200);
    view.on('change', onViewChange);
    return () => {
      view.un('change', onViewChange);
      // A 'change' event just before this view gets swapped out (e.g. for
      // a projection switch) can already have armed the 200ms debounce
      // timer - un() only stops future events, it doesn't cancel that
      // still-pending timer. Left uncancelled, it fires anyway, reading
      // this (by then detached) view's srs/bbox and dispatching it over
      // the newly-set projection, so the permalink doesn't always end up
      // advertising the projection the user actually switched to.
      onViewChange.cancel();
    };
  }, [view, syncViewToRedux]);

  return (
    <OpenLayersMapView view={view} mapId={mapId}>
      {isAnimating && animationClockLayer && (
        <AnimationClock
          key={animationClockLayer.id}
          layer={animationClockLayer}
          onTick={setAnimationTick}
        />
      )}
      {baseLayers
        // Only mounting enabled entries, rather than passing `enabled`
        // through and trusting it to toggle visibility: webmap-react's
        // OpenLayersLayer hardcodes `enabled: true` for any `type: 'twms'`
        // base/overlay layer internally (see its XYZLayer branch), so that
        // prop is silently ignored for every preset in baseLayerPresets.ts -
        // not rendering a disabled one at all is what actually hides it.
        .filter(
          (layer) => layer.layerType === LayerType.baseLayer && layer.enabled,
        )
        .map((layer, index) => (
          <OpenLayersLayer
            key={layer.id}
            {...layer}
            zIndex={BASE_LAYER_BASE_ZINDEX + index}
          />
        ))}
      {mapLayers.map((layer, index) => {
        return (
          <ErrorBoundary
            key={layer.id}
            fallbackMessage={`Layer "${layer.name}" failed to render`}
            fallbackStyle={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 1,
            }}
            onRemove={() => {
              dispatch(actions.removeLayer({ mapId, layerIndex: index }));
            }}
          >
            <ReduxMapLayer
              layer={layer}
              mapId={mapId}
              layerIndex={index}
              // mapLayers[0] is the top of the layer list, so it gets the
              // highest zIndex among the data layers.
              zIndex={DATA_LAYER_BASE_ZINDEX + mapLayers.length - 1 - index}
              // Only the layers that are part of the animation follow its
              // tick - see isLayerInAnimation.
              isAnimating={!!map && isLayerInAnimation(map, layer.id)}
              animationTick={animationTick}
              onInitializeLayer={({ layerId, style, dimensions }) => {
                dispatch(
                  actions.initializeLayer({
                    mapId,
                    layerId,
                    style,
                    dimensions: dimensions?.flatMap((dimension) =>
                      dimension.name
                        ? [
                            {
                              name: dimension.name,
                              currentValue: dimension.currentValue,
                            },
                          ]
                        : [],
                    ),
                  }),
                );
              }}
            />
          </ErrorBoundary>
        );
      })}
      {baseLayers
        .filter(
          (layer) => layer.layerType === LayerType.overLayer && layer.enabled,
        )
        .map((layer, index) => (
          <OpenLayersLayer
            key={layer.id}
            {...layer}
            zIndex={OVERLAY_BASE_ZINDEX + index}
          />
        ))}
      <OpenLayersGetFeatureInfo
        displayMapPin={isGetFeatureInfoActive}
        mapPinLocation={mapPinLocation}
        selectLocation={(location) => {
          if (isGetFeatureInfoActive) {
            dispatch(actions.setMapPinLocation({ mapId, location }));
          }
        }}
      />
      <OpenLayersHistogramBoxSelect
        active={isHistogramBoxSelectActive}
        onBoxSelected={(bbox, srs, pixelSize) => {
          dispatch(
            actions.setHistogramBox({
              mapId,
              box: {
                bbox,
                srs,
                pixelWidth: pixelSize.width,
                pixelHeight: pixelSize.height,
              },
            }),
          );
        }}
      />
      <Watermark />
    </OpenLayersMapView>
  );
};
