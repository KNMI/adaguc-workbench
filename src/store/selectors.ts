import { createSelector } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { LayerProps, Style } from '@opengeoweb/webmap';
import {
  AdagucLayer,
  AdagucMap,
  AdagucMapsState,
  AdagucService,
  ViewerState,
} from './types';
import { isLayerInAnimation } from './animation';

export const selectorMemoizationOptions = {
  memoizeOptions: {
    maxSize: 1000,
    resultEqualityCheck: isEqual,
  },
};

export const getAvailableLayers = createSelector(
  [
    (state: ViewerState) => state?.viewer,
    (_state: ViewerState, serviceUrl: string) => serviceUrl,
  ],
  (viewer: AdagucMapsState, serviceUrl: string): LayerProps[] => {
    const service = Object.values(viewer.services).find(
      (s: AdagucService) => s.serviceUrl === serviceUrl,
    );
    return service ? service.layers : [];
  },
  selectorMemoizationOptions,
);

export const getMapById = createSelector(
  [
    (state: ViewerState): AdagucMapsState => state?.viewer,
    (_state: ViewerState, mapId: string) => mapId,
  ],
  (viewer: AdagucMapsState, mapId: string): AdagucMap | null => {
    return viewer.maps[mapId] ?? null;
  },
  selectorMemoizationOptions,
);

export const getMapLayerIds = createSelector(
  [getMapById],
  (map: AdagucMap | null): string[] => {
    return map?.layers.map((l) => l.id) || [];
  },
  selectorMemoizationOptions,
);

export const getMapLayers = createSelector(
  [getMapById],
  (map: AdagucMap | null): AdagucLayer[] => {
    return map?.layers || [];
  },
  selectorMemoizationOptions,
);

export const getMapLayerById = createSelector(
  [
    getMapById,
    (_state: ViewerState, _mapId: string, layerId: string) => layerId,
  ],
  (map: AdagucMap | null, layerId: string): AdagucLayer | undefined => {
    return map?.layers.find((l) => l.id === layerId);
  },
  selectorMemoizationOptions,
);

// Whether this layer is part of the map's running animation (see
// isLayerInAnimation) - not just whether anything on the map animates.
export const isLayerAnimating = createSelector(
  [
    getMapById,
    (_state: ViewerState, _mapId: string, layerId: string) => layerId,
  ],
  (map: AdagucMap | null, layerId: string): boolean =>
    map ? isLayerInAnimation(map, layerId) : false,
  selectorMemoizationOptions,
);

export const isMapAnimating = createSelector(
  [getMapById],
  (map: AdagucMap | null): boolean => {
    return map?.isAnimating ?? false;
  },
  selectorMemoizationOptions,
);

const getServiceForLayer = createSelector(
  [
    (state: ViewerState): AdagucMapsState => state?.viewer,
    (_state, layer: AdagucLayer | undefined) => layer,
  ],
  (
    viewer: AdagucMapsState,
    layer: AdagucLayer | undefined,
  ): AdagucService | null => {
    if (!viewer) return null;
    const service = Object.values(viewer.services).find(
      (_service: AdagucService) => {
        return (
          (_service && _service.serviceUrl) === (layer && layer.serviceUrl)
        );
      },
    );
    if (!service || !service.layers || !service.layers.length) {
      return null;
    }

    return service;
  },
  selectorMemoizationOptions,
);

const getStyleListForLayer = createSelector(
  [getServiceForLayer, (_state, layer: AdagucLayer | undefined) => layer],
  (service: AdagucService | null, layer: AdagucLayer | undefined): Style[] => {
    if (!layer || !service || !service.layers || !service.layers.length) {
      return [];
    }
    const serviceLayer = service.layers.find((l) => {
      return l.name === layer.name;
    });
    if (!serviceLayer || !serviceLayer.styles || !serviceLayer.styles.length) {
      return [];
    }
    return serviceLayer.styles;
  },
  selectorMemoizationOptions,
);

const selectors = {
  getAvailableLayers,
  getMapLayerIds,
  getMapLayerById,
  getMapLayers,
  getStyleListForLayer,
  isMapAnimating,
  isLayerAnimating,
};
export { selectors };
