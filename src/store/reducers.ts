import { Style } from '@opengeoweb/webmap';
import { MapLocation } from '@opengeoweb/webmap-react';
import {
  AdagucHistogramBox,
  AdagucLayer,
  AdagucMapsState,
  AdagucService,
  AdagucMapView,
} from './types';
import { AddLayerInterfaceFulFilled } from './thunks';

// Commands (view, zoom-to-layer, AutoWMS) are applied by components that
// remember the last requestId they handled, so every new command needs an
// id different from the previous one - even when it repeats the same
// payload (e.g. zooming to the same layer twice).
const nextCommandRequestId = (draftState: AdagucMapsState): number => {
  draftState.lastCommandRequestId = (draftState.lastCommandRequestId ?? 0) + 1;
  return draftState.lastCommandRequestId;
};

const getReduxLayer = (
  draftState: AdagucMapsState,
  mapId: string,
  layerIndex: number,
): AdagucLayer | null => {
  const map = draftState.maps[mapId];
  if (!map || !map.layers[layerIndex]) {
    // eslint-disable-next-line no-console
    console.error(`No layer with index ${layerIndex} found for mapId ${mapId}`);
    return null;
  }
  return map.layers[layerIndex];
};

const setDimensionForReduxLayer = (
  reduxLayer: AdagucLayer,
  dimensionName: string,
  dimensionValue: string,
) => {
  if (reduxLayer) {
    const reduxDim = reduxLayer.dimensions.find(
      (dim) => dim.name === dimensionName,
    );
    if (reduxDim) {
      reduxDim.currentValue = dimensionValue;
    } else {
      reduxLayer.dimensions.push({
        name: dimensionName,
        currentValue: dimensionValue,
      });
    }
  }
};

const getServiceByServiceUrl = (
  draftState: AdagucMapsState,
  serviceUrl: string,
): AdagucService | undefined => {
  const service = Object.values(draftState.services).find(
    (s) => s.serviceUrl === serviceUrl,
  );
  return service;
};

// Mirrors selectors.getStyleListForLayer, but as a plain (unmemoized)
// lookup - reducers run inside an Immer produce() call, and feeding that
// draft state into a memoized reselect selector leaves its cache holding a
// reference to this draft; once produce() finishes, Immer revokes the
// draft's proxy, and the next call to the selector crashes trying to
// compare against that now-revoked reference ("Cannot perform 'IsArray'
// on a proxy that has been revoked").
const getStyleListForReduxLayer = (
  draftState: AdagucMapsState,
  draftLayer: AdagucLayer,
): Style[] => {
  const service = getServiceByServiceUrl(draftState, draftLayer.serviceUrl);
  const serviceLayer = service?.layers.find((l) => l.name === draftLayer.name);
  return serviceLayer?.styles ?? [];
};

export const reducers = {
  registerMap: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string } },
  ): AdagucMapsState => {
    const { mapId } = action.payload;
    if (!draftState.maps[mapId]) {
      draftState.maps[mapId] = {
        layers: [],
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        view: {
          srs: 'EPSG:3857',
          bbox: {
            left: -19000000,
            bottom: -19000000,
            right: 19000000,
            top: 19000000,
          },
        },
      };
    }
    return draftState;
  },
  updateMapView: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; view: AdagucMapView } },
  ): AdagucMapsState => {
    const { mapId, view } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].view = view;
    return draftState;
  },
  requestSetProjection: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; srs: string; bbox: AdagucMapView['bbox'] };
    },
  ): AdagucMapsState => {
    const { mapId, srs, bbox } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].viewCommand = {
      srs,
      bbox,
      requestId: nextCommandRequestId(draftState),
    };
    return draftState;
  },
  requestAutoWMSService: (
    draftState: AdagucMapsState,
    action: { payload: { service: string } },
  ): AdagucMapsState => {
    const { service } = action.payload;
    draftState.autoWMSServiceCommand = {
      service,
      requestId: nextCommandRequestId(draftState),
    };
    return draftState;
  },
  requestZoomToLayer: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; layerId: string } },
  ): AdagucMapsState => {
    const { mapId, layerId } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].zoomToLayerCommand = {
      layerId,
      requestId: nextCommandRequestId(draftState),
    };
    return draftState;
  },
  setGetFeatureInfoActive: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; active: boolean } },
  ): AdagucMapsState => {
    const { mapId, active } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    // Deliberately keeps mapPinLocation on deactivate: both GetFeatureInfo
    // and TimeSeries read it, and switching between those tabs toggles
    // this flag without the pin itself having moved - clearing it would
    // erase whichever of them isn't currently in front.
    draftState.maps[mapId].isGetFeatureInfoActive = active;
    return draftState;
  },
  setMapPinLocation: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; location: MapLocation | undefined };
    },
  ): AdagucMapsState => {
    const { mapId, location } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].mapPinLocation = location;
    return draftState;
  },
  setHistogramBoxSelectActive: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; active: boolean } },
  ): AdagucMapsState => {
    const { mapId, active } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].isHistogramBoxSelectActive = active;
    return draftState;
  },
  setHistogramBox: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; box: AdagucHistogramBox | undefined };
    },
  ): AdagucMapsState => {
    const { mapId, box } = action.payload;
    if (!draftState.maps[mapId]) {
      return draftState;
    }
    draftState.maps[mapId].histogramBox = box;
    return draftState;
  },
  setBaseLayerEnabled: (
    draftState: AdagucMapsState,
    action: { payload: { id: string; enabled: boolean } },
  ): AdagucMapsState => {
    const { id, enabled } = action.payload;
    const baseLayer = draftState.baseLayers.find((l) => l.id === id);
    if (baseLayer) {
      baseLayer.enabled = enabled;
    }
    return draftState;
  },
  setLayerOrderByIds: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; layerListIds: string[] } },
  ): void => {
    const { mapId, layerListIds } = action.payload;
    const map = draftState.maps[mapId];
    if (!map?.layers) {
      return;
    }
    // An id that isn't (or is no longer) on the map is skipped rather than
    // leaving an undefined hole in the layer list.
    const newLayerListOrder = layerListIds.flatMap((idToFind) => {
      const layer = map.layers.find((l) => l.id === idToFind);
      return layer ? [layer] : [];
    });
    map.layers = newLayerListOrder;
  },
  layerToggleAnimation: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; layerIndex: number } },
  ): void => {
    const { mapId } = action.payload;
    if (!draftState.maps[mapId]?.layers) {
      return;
    }
    draftState.maps[mapId].isAnimating = !draftState.maps[mapId].isAnimating;
  },
  removeLayer: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string; layerIndex: number } },
  ): void => {
    const { mapId, layerIndex } = action.payload;
    if (!draftState.maps[mapId]?.layers) {
      return;
    }

    draftState.maps[mapId].layers.splice(layerIndex, 1);
  },
  removeAllLayers: (
    draftState: AdagucMapsState,
    action: { payload: { mapId: string } },
  ): void => {
    const { mapId } = action.payload;
    if (!draftState.maps[mapId]?.layers) {
      return;
    }
    draftState.maps[mapId].layers.length = 0;
  },
  changeLayerStyle: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; layerIndex: number; styleName: string };
    },
  ): AdagucMapsState => {
    const { mapId, layerIndex, styleName } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (!draftLayer) {
      return draftState;
    }
    const styleList = getStyleListForReduxLayer(draftState, draftLayer);
    const exists = styleList.find((style) => style.name === styleName);
    const newStyleName = styleList.length > 0 ? styleList[0].name : 'default';
    draftLayer.style = exists ? styleName : newStyleName;

    return draftState;
  },
  layerChangeOpacity: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; layerIndex: number; opacity: number };
    },
  ): AdagucMapsState => {
    const { mapId, layerIndex, opacity } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (draftLayer) {
      draftLayer.opacity = opacity;
    }
    return draftState;
  },
  layerChangeEnabled: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; layerIndex: number; enabled: boolean };
    },
  ): AdagucMapsState => {
    const { mapId, layerIndex, enabled } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (draftLayer) {
      draftLayer.enabled = enabled;
    }
    return draftState;
  },
  changeLayerName: (
    draftState: AdagucMapsState,
    action: {
      payload: { mapId: string; layerIndex: number; layerName: string };
    },
  ): void => {
    const { mapId, layerIndex, layerName } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (!draftLayer) {
      return;
    }
    const service = getServiceByServiceUrl(draftState, draftLayer.serviceUrl);
    const newLayer = service?.layers.find((l) => l.name === layerName);
    if (!newLayer?.name) {
      // eslint-disable-next-line no-console
      console.error(`Layer ${layerName} not found in ${draftLayer.serviceUrl}`);
      return;
    }
    draftLayer.name = newLayer.name;
    const newStyle = draftLayer.style || newLayer.styles?.[0]?.name || '';
    reducers.changeLayerStyle(draftState, {
      payload: { mapId, layerIndex, styleName: newStyle },
    });
  },
  changeLayerDimension: (
    draftState: AdagucMapsState,
    action: {
      payload: {
        mapId: string;
        layerIndex: number;
        dimensionName: string;
        dimensionValue: string;
      };
    },
  ): void => {
    const { mapId, layerIndex, dimensionName, dimensionValue } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (!draftLayer) {
      return;
    }
    draftState.maps[mapId].isAnimating = false;

    setDimensionForReduxLayer(draftLayer, dimensionName, dimensionValue);

    // Mimic the webmap's old map-level dimension linking: propagate the new
    // value to other layers that have opted in to sync this dimension name
    // (see setLayerDimensionLinked).
    draftState.maps[mapId].layers.forEach((otherLayer) => {
      if (otherLayer.id === draftLayer.id) {
        return;
      }
      const otherDim = otherLayer.dimensions.find(
        (dim) => dim.name === dimensionName,
      );
      if (otherDim?.linked) {
        setDimensionForReduxLayer(otherLayer, dimensionName, dimensionValue);
      }
    });
  },
  // Toggles whether a layer's dimension is "linked": changing it on any
  // other linked layer then also updates this one, and vice versa - see
  // changeLayerDimension's propagation.
  setLayerDimensionLinked: (
    draftState: AdagucMapsState,
    action: {
      payload: {
        mapId: string;
        layerIndex: number;
        dimensionName: string;
        linked: boolean;
      };
    },
  ): void => {
    const { mapId, layerIndex, dimensionName, linked } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (!draftLayer) {
      return;
    }
    const dim = draftLayer.dimensions.find((d) => d.name === dimensionName);
    if (dim) {
      dim.linked = linked;
    }
  },
  // Mirrors the layer's own time-animation step back into redux, so the
  // sidebar's time slider (which reads the layer's redux-tracked
  // dimensions) follows along. Deliberately doesn't touch isAnimating or
  // link other layers like changeLayerDimension does: this fires on every
  // animation tick, and either of those would fight the animation itself.
  syncAnimatedLayerDimension: (
    draftState: AdagucMapsState,
    action: {
      payload: {
        mapId: string;
        layerIndex: number;
        dimensionName: string;
        dimensionValue: string;
      };
    },
  ): void => {
    const { mapId, layerIndex, dimensionName, dimensionValue } = action.payload;
    const draftLayer = getReduxLayer(draftState, mapId, layerIndex);
    if (!draftLayer) {
      return;
    }
    setDimensionForReduxLayer(draftLayer, dimensionName, dimensionValue);
  },
  fullFillfetchWMSService: (
    draftState: AdagucMapsState,
    action: { payload: AdagucService },
  ): void => {
    const { payload } = action;
    const { id, layers, serviceUrl } = payload;
    draftState.services[id] = {
      id,
      layers,
      serviceUrl,
    };
  },
  fullFillAddLayer: (
    draftState: AdagucMapsState,
    action: { payload: AddLayerInterfaceFulFilled },
  ): void => {
    reducers.registerMap(draftState, action);
    const {
      serviceUrl,
      name,
      mapId,
      id,
      dimensions,
      enabled,
      styleName,
      opacity,
      hasError,
    } = action.payload;
    const service = getServiceByServiceUrl(draftState, serviceUrl);
    const layers = service ? service.layers : [];
    const layer = layers.find((layeri) => layeri.name === name);
    // Add the layer even when it isn't (yet) in the available-layers list:
    // some services don't enumerate their layers via GetCapabilities even
    // though the layer itself works fine, and a layer the service
    // genuinely doesn't have should still show up in the layer list
    // rather than vanish silently, so the user can see what was requested.
    draftState.maps[mapId].layers.unshift({
      name,
      enabled: enabled ?? true,
      serviceUrl,
      id,
      style: styleName || layer?.styles?.[0]?.name || '',
      dimensions,
      opacity: opacity || 1,
      isReady: false,
      hasError,
    });
  },
  // Called once a layer's WMS capabilities have been parsed (via
  // OpenLayersLayer's onInitializeLayer), to keep redux's dimensions/style
  // in sync with what the layer actually supports.
  //
  // Flipping isReady is what actually matters here: the layer panel reads
  // its title and dimension list from the live WMLayer registry, not from
  // redux, so it only notices that data exists once it re-renders for some
  // other reason. The selectors it subscribes through do a deep-equality
  // result check, so merely re-dispatching dimensions/style that already
  // match (the common case, since the add-layer thunk already parses the
  // layer once before this fires) would never be seen as a change. isReady
  // going false -> true always is one, which is what forces that re-render.
  initializeLayer: (
    draftState: AdagucMapsState,
    action: {
      payload: {
        mapId: string;
        layerId: string;
        style?: string;
        dimensions?: AdagucLayer['dimensions'];
      };
    },
  ): AdagucMapsState => {
    const { mapId, layerId, style, dimensions } = action.payload;
    const draftLayer = draftState.maps[mapId]?.layers.find(
      (l) => l.id === layerId,
    );
    if (!draftLayer) {
      return draftState;
    }
    draftLayer.isReady = true;
    if (dimensions?.length) {
      draftLayer.dimensions = dimensions;
    }
    if (style) {
      draftLayer.style = style;
    }
    return draftState;
  },
};
