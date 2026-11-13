import { createAsyncThunk } from '@reduxjs/toolkit';
import { LayerType, WMLayer, generateLayerId } from '@opengeoweb/webmap';
import { fetchWMSServiceAsynced } from './promises';
import { selectors } from './selectors';
import { AdagucLayerDimension, ViewerState } from './types';

export interface AddLayerInterface {
  mapId: string;
  // Optional: without one, the service's first layer is added.
  name?: string;
  serviceUrl: string;
  enabled?: boolean;
  opacity?: number;
  styleName?: string;
}

export interface AddLayerInterfaceFulFilled {
  mapId: string;
  name: string;
  serviceUrl: string;
  id: string;
  dimensions: AdagucLayerDimension[];
  enabled?: boolean;
  opacity?: number;
  styleName?: string;
  hasError?: boolean;
}

export const fetchWMSService = createAsyncThunk(
  'services/fetchWMSService',
  async (wmsServiceURL: string) => {
    return fetchWMSServiceAsynced(wmsServiceURL);
  },
);

// @opengeoweb/webmap's internal query client retries a failed request (e.g.
// an unreachable service) 3 times with exponential backoff before giving
// up, which can take much longer than this timeout to fail on its own.
// Racing it against this instead lets addLayer fall back quickly (see
// below) to still showing the layer, rather than leaving the UI looking
// stuck for however long that retry chain takes.
const ADD_LAYER_TIMEOUT_MS = 10000;

// Settles like `promise` (passing its own rejection through untouched), or
// rejects once `ms` has passed first.
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Thunks that read the store through getState() need to know its shape.
const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: ViewerState;
}>();

export const addLayer = createAppAsyncThunk(
  'maps/addLayer',
  async (payload: AddLayerInterface, thunkAPI) => {
    const { dispatch, getState } = thunkAPI;
    const { serviceUrl, name, mapId, enabled, styleName, opacity } = payload;
    await withTimeout(
      dispatch(fetchWMSService(serviceUrl)),
      ADD_LAYER_TIMEOUT_MS,
      // dispatching an async thunk never itself rejects (it always
      // resolves to a fulfilled or rejected action) - only the timeout can
      // reject here, and getAvailableLayers below already handles the
      // service simply having no layers yet, the same as if it timed out.
    ).catch(() => undefined);
    const layers = selectors.getAvailableLayers(getState(), serviceUrl);

    // Trust an explicitly requested layer name (e.g. from a permalink)
    // rather than requiring it to be listed by GetCapabilities first: some
    // services don't enumerate their layers there even though the layer
    // itself works fine, and a layer the service genuinely doesn't have
    // should still show up in the layer list (if with empty dimensions)
    // rather than vanish silently, so the user can see what was requested.
    const layerToFind = layers.find((layeri) => layeri.name === name);
    const layerName = layerToFind ? name : (layers[0]?.name ?? name);
    // No name was asked for, and the service lists no layers to pick one
    // from - there is nothing meaningful to add (this used to add a
    // nameless entry to the layer list instead).
    if (!layerName) {
      throw new Error(`${serviceUrl} doesn't list any layers to add.`);
    }
    const id = generateLayerId();
    const wmLayer = new WMLayer({
      id,
      service: serviceUrl,
      name: layerName,
      layerType: LayerType.mapLayer,
      enabled,
      style: styleName,
    });

    let dimensions: AdagucLayerDimension[] = [];
    let hasError = false;
    try {
      await withTimeout(wmLayer.parseLayer(), ADD_LAYER_TIMEOUT_MS);
      wmLayer.enabled = enabled;
      if (styleName && styleName.length > 0) {
        wmLayer.setStyle(styleName);
      }
      dimensions = wmLayer.dimensions.map((dim) => ({
        name: dim.name,
        currentValue: dim.currentValue,
      }));
    } catch (e) {
      hasError = true;
      // eslint-disable-next-line no-console
      console.warn(
        `Could not fully resolve layer "${layerName}" on ${serviceUrl}; adding it to the layer list anyway.`,
        e,
      );
    }

    return {
      name: layerName,
      // Not `enabled || true`, which turned a permalink's disabled layer
      // back on in redux while the WMLayer itself stayed disabled.
      enabled: enabled ?? true,
      opacity: opacity ?? 1,
      styleName,
      serviceUrl,
      mapId,
      id,
      dimensions,
      hasError,
    };
  },
);

const thunks = { fetchWMSService, addLayer };
export { thunks };
