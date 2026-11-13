import * as React from 'react';
import { LayerType } from '@opengeoweb/webmap';
import { getWMLayer } from '../utils/getWMLayer';
import {
  OnInitializeLayerProps,
  OpenLayersLayer,
  OpenLayersLayerProps,
  TimeContext,
  TimeContextType,
} from '@opengeoweb/webmap-react';
import { actions, useAppDispatch } from '../store/store';
import { AdagucLayer } from '../store/types';
import { AnimationTick } from './AnimationClock';

// Stable reference, since a fresh {} literal on every render would make
// TimeContext.Provider's value prop "change" every render even when
// nothing really did.
const DEFAULT_TIME_CONTEXT: TimeContextType = {
  isAnimating: false,
  prefetchList: [],
};

// webmap-react requests WMS imagery extentRatio^2 % larger than the
// current view extent (default 1.2) so panning has a margin of already-
// fetched image to show before the next GetMap request lands. Set to 1.0
// (request exactly the current view extent, no margin) instead.
const WMS_EXTENT_RATIO = 1.0;

export interface ReduxMapLayerProps {
  layer: AdagucLayer;
  mapId: string;
  layerIndex: number;
  zIndex: number;
  isAnimating: boolean;
  // The single shared animation step driving every animated layer (see
  // AnimationClock/ReduxMapViewComponent) - null until its first tick, or
  // whenever not animating.
  animationTick: AnimationTick | null;
  onLayerReady?: () => void;
  onLayerError?: () => void;
  onInitializeLayer: (payload: OnInitializeLayerProps) => void;
}

const getLayerProps = (
  layer: AdagucLayer,
  zIndex: number,
): OpenLayersLayerProps => ({
  id: layer.id,
  service: layer.serviceUrl,
  style: layer.style,
  enabled: layer.enabled,
  opacity: layer.opacity ?? 1,
  layerType: LayerType.mapLayer,
  name: layer.name,
  dimensions: layer.dimensions,
  zIndex,
  extentRatio: WMS_EXTENT_RATIO,
});

interface InnerLayerProps {
  layer: AdagucLayer;
  zIndex: number;
  onLayerReady?: () => void;
  onLayerError?: () => void;
  onInitializeLayer: (payload: OnInitializeLayerProps) => void;
}

interface AnimatedInnerLayerProps extends InnerLayerProps {
  mapId: string;
  layerIndex: number;
  animationTick: AnimationTick | null;
}

// Renders the layer with its redux-tracked dimensions. Used whenever this
// layer isn't animating.
const StaticMapLayer = ({
  layer,
  zIndex,
  onLayerReady,
  onLayerError,
  onInitializeLayer,
}: InnerLayerProps): React.ReactElement => (
  <OpenLayersLayer
    {...getLayerProps(layer, zIndex)}
    onLayerReady={onLayerReady}
    onLayerError={onLayerError}
    onInitializeLayer={onInitializeLayer}
  />
);

// Renders the layer following the shared animation tick, instead of
// stepping through time on its own - see AnimationClock for why.
const AnimatedMapLayer = ({
  layer,
  mapId,
  layerIndex,
  zIndex,
  animationTick,
  onLayerReady,
  onLayerError,
  onInitializeLayer,
}: AnimatedInnerLayerProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const layerProps = getLayerProps(layer, zIndex);

  // The shared tick's time value comes from whichever layer drives the
  // clock, which may have a different time resolution/range than this
  // layer - snap it to this layer's own closest matching value, the same
  // way getMapDimURL does for dimension overrides elsewhere.
  const snappedTime = React.useMemo(() => {
    if (!animationTick) {
      return undefined;
    }
    const timeDimension = getWMLayer(layer.id)?.getDimension('time');
    return (
      timeDimension?.getClosestValue(animationTick.time, true) ??
      animationTick.time
    );
  }, [layer.id, animationTick]);

  // useAnimationForLayer (used by the clock) only drives the map's own
  // rendering - it never touches redux, so the sidebar's time slider
  // (which reads the layer's redux-tracked dimensions) never reflected the
  // animation. Mirroring the animated time back into redux here keeps it
  // in sync. This can't use the regular changeLayerDimension action: its
  // reducer always turns isAnimating off (correct for a user dragging the
  // slider, but would stop the animation immediately if used to sync it).
  React.useEffect(() => {
    if (!snappedTime) {
      return;
    }
    dispatch(
      actions.syncAnimatedLayerDimension({
        mapId,
        layerIndex,
        dimensionName: 'time',
        dimensionValue: snappedTime,
      }),
    );
  }, [snappedTime, dispatch, mapId, layerIndex]);

  // TimeawareImageSourceWMSLayer (what OpenLayersLayer renders for a WMS
  // layer) only prefetches upcoming animation frames when it reads
  // isAnimating/prefetchList from this context - without a provider here,
  // every tick fell back to a cold GetMap request instead of an
  // already-cached tile, which is what made the animation feel slow.
  return (
    <TimeContext.Provider
      value={animationTick?.timeContext ?? DEFAULT_TIME_CONTEXT}
    >
      <OpenLayersLayer
        {...layerProps}
        dimensions={
          snappedTime
            ? [{ name: 'time', currentValue: snappedTime }]
            : layerProps.dimensions
        }
        onLayerReady={onLayerReady}
        onLayerError={onLayerError}
        onInitializeLayer={onInitializeLayer}
      />
    </TimeContext.Provider>
  );
};

export const ReduxMapLayer = ({
  layer,
  mapId,
  layerIndex,
  zIndex,
  isAnimating,
  animationTick,
  onLayerReady,
  onLayerError,
  onInitializeLayer,
}: ReduxMapLayerProps): React.ReactElement => {
  if (isAnimating) {
    return (
      <AnimatedMapLayer
        layer={layer}
        mapId={mapId}
        layerIndex={layerIndex}
        zIndex={zIndex}
        animationTick={animationTick}
        onLayerReady={onLayerReady}
        onLayerError={onLayerError}
        onInitializeLayer={onInitializeLayer}
      />
    );
  }
  return (
    <StaticMapLayer
      layer={layer}
      zIndex={zIndex}
      onLayerReady={onLayerReady}
      onLayerError={onLayerError}
      onInitializeLayer={onInitializeLayer}
    />
  );
};
