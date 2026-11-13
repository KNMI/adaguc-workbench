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

export const selectorMemoizationOptions = {
  memoizeOptions: {
    maxSize: 1000,
    resultEqualityCheck: isEqual,
  },
};

export const getAvailableLayers = createSelector(
  [
    (state: ViewerState) => state?.viewer,
    (_state, serviceUrl: string) => serviceUrl,
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
    (_state, mapId: string) => mapId,
  ],
  (viewer: AdagucMapsState, mapId: string): AdagucMap | null => {
    return viewer.maps[mapId];
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
  [getMapById, (_1, _2, layerId: string) => layerId],
  (map: AdagucMap, layerId): AdagucLayer | null => {
    return map?.layers.find((l) => l.id === layerId);
  },
  selectorMemoizationOptions,
);

export const isMapAnimating = createSelector(
  [getMapById],
  (map: AdagucMap): boolean | null => {
    return map?.isAnimating;
  },
  selectorMemoizationOptions,
);

const getServiceForLayer = createSelector(
  [
    (state: ViewerState): AdagucMapsState => state?.viewer,
    (_state, layer: AdagucLayer) => layer,
  ],
  (viewer: AdagucMapsState, layer: AdagucLayer): AdagucService | null => {
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
  [getServiceForLayer, (_state, layer: AdagucLayer) => layer],
  (service: AdagucService | null, layer: AdagucLayer): Style[] => {
    if (!service || !service.layers || !service.layers.length) {
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
};
export { selectors };
