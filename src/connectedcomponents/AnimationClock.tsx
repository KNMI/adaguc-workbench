import * as React from 'react';
import { LayerType, getWMLayerById } from '@opengeoweb/webmap';
import {
  OpenLayersLayerProps,
  TimeContextType,
  useAnimationForLayer,
} from '@opengeoweb/webmap-react';
import { AdagucLayer } from '../store/types';

export const ANIMATION_INTERVAL_MS = 300;
const ANIMATION_NUM_STEPS = 24;
// However close to the latest step the slider already is, the animated
// window still needs to cover at least this many steps - otherwise
// starting the animation right at (or near) the latest value produced a
// window of just 1-2 steps, which looks like nothing happens at all.
const MIN_ANIMATION_STEPS = 12;

// useAnimationForLayer always loops over its last `numStepsTillLatest` time
// steps, counted back from the dimension's own latest value - it has no
// notion of "start from wherever the slider currently is". Passing it
// size-of-window-from-the-current-index instead (so the window runs from
// the current time through to latest, then wraps) gets the same looping
// behaviour, but starting where the user left it.
export const getNumStepsFromCurrentTime = (layer: AdagucLayer): number => {
  const timeDimension = getWMLayerById(layer.id)?.getDimension('time');
  const currentValue = layer.dimensions.find(
    (dimension) => dimension.name === 'time',
  )?.currentValue;
  if (!timeDimension || !currentValue) {
    return ANIMATION_NUM_STEPS;
  }
  const currentIndex = timeDimension.getIndexForValue(currentValue);
  if (currentIndex < 0) {
    return ANIMATION_NUM_STEPS;
  }
  const totalSteps = timeDimension.size();
  const stepsFromCurrentToLatest = totalSteps - currentIndex;
  return Math.max(
    1,
    Math.min(
      totalSteps,
      Math.max(MIN_ANIMATION_STEPS, stepsFromCurrentToLatest),
    ),
  );
};

export interface AnimationTick {
  time: string;
  timeContext: TimeContextType;
}

export interface AnimationClockProps {
  layer: AdagucLayer;
  onTick: (tick: AnimationTick) => void;
}

// Drives a single, shared animation step for every animated layer on the
// map. Each animated layer used to call useAnimationForLayer itself, each
// with its own independent setInterval - since those timers aren't
// synchronised with each other, layers visibly updated at slightly
// different moments. Mounting exactly one of these (see
// ReduxMapViewComponent, which picks one layer to drive it) and sharing its
// result across every animated layer keeps them all moving in lockstep,
// since they then all re-render from the same redux/state update.
export const AnimationClock = ({
  layer,
  onTick,
}: AnimationClockProps): null => {
  const layerProps: OpenLayersLayerProps = {
    id: layer.id,
    service: layer.serviceUrl,
    style: layer.style,
    enabled: layer.enabled,
    opacity: layer.opacity || 1,
    layerType: LayerType.mapLayer,
    name: layer.name,
    dimensions: layer.dimensions,
  };
  // Computed once, from the layer's dimensions as they are at the moment
  // this mounts (i.e. when animation is switched on) - not recomputed on
  // every render, so later updates don't keep shifting the window this is
  // animating over.
  const [numStepsTillLatest] = React.useState(() =>
    getNumStepsFromCurrentTime(layer),
  );
  const { dimensions, timeContext } = useAnimationForLayer(
    layerProps,
    ANIMATION_INTERVAL_MS,
    numStepsTillLatest,
  );
  const time = dimensions.find(
    (dimension) => dimension.name === 'time',
  )?.currentValue;

  // Ticks once per new time step, passing along whatever timeContext is
  // current at that moment - timeContext changing on its own isn't a tick.
  const emitTick = React.useEffectEvent((tickTime: string) => {
    onTick({ time: tickTime, timeContext });
  });
  React.useEffect(() => {
    if (!time) {
      return;
    }
    emitTick(time);
  }, [time]);

  return null;
};
