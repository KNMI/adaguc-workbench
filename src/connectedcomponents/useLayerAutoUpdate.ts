import * as React from 'react';
import { queryWMSLayer } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { actions, useAppDispatch } from '../store/store';
import { AdagucLayer } from '../store/types';
import { getWMLayer } from '../utils/getWMLayer';

// How often an auto-updating layer asks its server for a new default time.
export const AUTO_UPDATE_INTERVAL_MS = 20_000;

// The time a layer's WMS capabilities last advertised as its default (the
// `default` of its time <Dimension>) - undefined when it has no time
// dimension (yet). WMJSDimension already resolves a default of 'current' to
// the value closest to now, and an absent one to the last value; the last
// value is used here too should it still have none.
export const getDefaultTime = (layerId: string): string | undefined => {
  const dimension = getWMLayer(layerId)?.getDimension('time');
  if (!dimension) {
    return undefined;
  }
  if (dimension.defaultValue) {
    return dimension.defaultValue;
  }
  const size = dimension.size();
  return size > 0 ? String(dimension.getValueForIndex(size - 1)) : undefined;
};

// Re-reads a layer's capabilities, including the default time they now
// advertise. WMLayer.parseLayer(true) fetches the capabilities anew and
// updates an existing time dimension's values, but keeps the default it
// found when the layer was first added - so that is read here from the
// capabilities it just fetched (webmap's own cache: no second request) and
// put on the dimension. 'current' means the value closest to now.
export const refreshLayerCapabilities = async (
  wmLayer: WMLayer,
): Promise<void> => {
  await wmLayer.parseLayer(true);
  const dimension = wmLayer.getDimension('time');
  if (!dimension || !wmLayer.name) {
    return;
  }
  const layerProps = await queryWMSLayer(wmLayer.service, wmLayer.name, true);
  const advertised = layerProps.dimensions?.find(
    (candidate) => candidate.name?.toLowerCase() === 'time',
  )?.currentValue;
  if (advertised) {
    dimension.defaultValue =
      advertised === 'current'
        ? dimension.getClosestValue(new Date().toISOString(), true)
        : advertised;
  }
};

// Keeps a layer with autoUpdate switched on at its default time: re-reads
// its capabilities when switched on and then every AUTO_UPDATE_INTERVAL_MS,
// and moves its time to the default they advertise (for most services the
// newest time). Not while the layer animates - it goes back to the default
// once that stops. Changing the time by hand switches autoUpdate off (see
// the changeLayerDimension reducer).
//
// Returns when the current check started (a Date.now() timestamp) - the
// next one follows AUTO_UPDATE_INTERVAL_MS later - or undefined while off.
export const useLayerAutoUpdate = ({
  mapId,
  layerIndex,
  layer,
  isAnimating,
}: {
  mapId: string;
  layerIndex: number;
  layer: AdagucLayer | undefined;
  isAnimating: boolean;
}): number | undefined => {
  const dispatch = useAppDispatch();
  const autoUpdate = !!layer?.autoUpdate;
  const [checkStartedAt, setCheckStartedAt] = React.useState<number>();

  const jumpToDefault = React.useEffectEvent((): void => {
    if (!layer?.autoUpdate || isAnimating) {
      return;
    }
    const defaultTime = getDefaultTime(layer.id);
    const current = layer.dimensions.find(
      (dimension) => dimension.name === 'time',
    )?.currentValue;
    if (defaultTime && defaultTime !== current) {
      dispatch(
        actions.changeLayerDimension({
          mapId,
          layerIndex,
          dimensionName: 'time',
          dimensionValue: defaultTime,
          fromAutoUpdate: true,
        }),
      );
    }
  });

  const refreshAndJump = React.useEffectEvent(async (): Promise<void> => {
    setCheckStartedAt(Date.now());
    const wmLayer = layer && getWMLayer(layer.id);
    if (wmLayer) {
      try {
        await refreshLayerCapabilities(wmLayer);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(e);
      }
    }
    jumpToDefault();
  });

  // On switching on (and for a newly chosen layer name), then every
  // interval.
  const layerName = layer?.name;
  React.useEffect(() => {
    if (!autoUpdate) {
      setCheckStartedAt(undefined);
      return undefined;
    }
    void refreshAndJump();
    const intervalId = setInterval(() => {
      void refreshAndJump();
    }, AUTO_UPDATE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [autoUpdate, layerName]);

  // Back to the default time as soon as an animation of this layer stops.
  React.useEffect(() => {
    if (autoUpdate && !isAnimating) {
      jumpToDefault();
    }
  }, [autoUpdate, isAnimating]);

  return checkStartedAt;
};
