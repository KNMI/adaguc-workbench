import * as React from 'react';
import { actions, useAppDispatch } from '../store/store';
import { AdagucLayer } from '../store/types';
import { getWMLayer } from '../utils/getWMLayer';

const isTimeValue = (value: string | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}T/.test(value);

// For a layer with a reference_time (model run) dimension: keeps its time
// steps to those of the chosen run, as the old adaguc-viewer did - set once
// its capabilities are read, and again whenever the reference time
// changes (its own slider, a linked layer, a permalink).
//
// The run's steps come from opengeoweb's WMLayer.handleReferenceTime: from
// the reference time on, for as long as a run lasts (the advertised end
// minus the newest reference time). webmap-react only does this once, when
// it first sets a layer up, so a later change of reference time would keep
// the first run's steps.
//
// The selected time then stays if that run has it, or else moves to the
// run's nearest step - without that counting as a time picked by hand (it
// leaves auto-update on).
export const useReferenceTimeSteps = ({
  mapId,
  layerIndex,
  layer,
}: {
  mapId: string;
  layerIndex: number;
  layer: AdagucLayer | undefined;
}): void => {
  const dispatch = useAppDispatch();
  const referenceTime = layer?.dimensions.find(
    (dimension) => dimension.name === 'reference_time',
  )?.currentValue;
  const isReady = !!layer?.isReady;
  const layerId = layer?.id;

  const applyRun = React.useEffectEvent((): void => {
    if (!layer || !isTimeValue(referenceTime)) {
      return;
    }
    const wmLayer = getWMLayer(layer.id);
    const timeDimension = wmLayer?.getDimension('time');
    const referenceTimeDimension = wmLayer?.getDimension('reference_time');
    if (!wmLayer || !timeDimension || !referenceTimeDimension) {
      return;
    }
    // Also on the WMLayer's own reference_time, which it reapplies itself
    // when its capabilities are read again (auto-update, reload).
    referenceTimeDimension.setValue(referenceTime);
    wmLayer.handleReferenceTime('reference_time', referenceTime);

    const time = layer.dimensions.find(
      (dimension) => dimension.name === 'time',
    )?.currentValue;
    if (isTimeValue(time)) {
      const closest = timeDimension.getClosestValue(time, true);
      if (isTimeValue(closest) && closest !== time) {
        dispatch(
          actions.changeLayerDimension({
            mapId,
            layerIndex,
            dimensionName: 'time',
            dimensionValue: closest,
            fromReferenceTime: true,
          }),
        );
      }
    }
    dispatch(
      actions.setLayerTimeStepsFor({ mapId, layerIndex, referenceTime }),
    );
  });

  React.useEffect(() => {
    applyRun();
  }, [layerId, referenceTime, isReady]);
};
