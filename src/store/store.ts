/* A simple redux store/actions/reducer implementation.
 * A true app would be more complex and separated into different files.
 */
import {
  AnyAction,
  ThunkDispatch,
  configureStore,
  createSlice,
} from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { AdagucMapsState, ViewerState } from './types';
import { addLayer, fetchWMSService } from './thunks';
import { reducers } from './reducers';
import { DEFAULT_BASE_LAYERS } from '../utils/baseLayerPresets';

const removePendingLayer = (
  draftState: AdagucMapsState,
  requestId: string,
): void => {
  draftState.pendingLayers = draftState.pendingLayers?.filter(
    (pending) => pending.requestId !== requestId,
  );
};

const initialState: AdagucMapsState = {
  maps: {},
  services: {},
  baseLayers: DEFAULT_BASE_LAYERS,
};

/*
 * The store is created here.
 * You can read more about Redux Toolkit's slices in the docs:
 * https://redux-toolkit.js.org/api/createSlice
 */
const ViewerSlice = createSlice({
  name: 'wmsservices',
  initialState,
  reducers,
  extraReducers: (builder) => {
    // Add reducers for additional action types here, and handle loading state as needed
    builder.addCase(
      fetchWMSService.fulfilled,
      reducers.fullFillfetchWMSService,
    );
    // A layer being added shows in the layers panel straight away, until its
    // request is done - either way.
    builder.addCase(addLayer.pending, (draftState, action) => {
      const { mapId, name, serviceUrl } = action.meta.arg;
      draftState.pendingLayers = [
        { requestId: action.meta.requestId, mapId, name, serviceUrl },
        ...(draftState.pendingLayers ?? []),
      ];
    });
    builder.addCase(addLayer.fulfilled, (draftState, action) => {
      removePendingLayer(draftState, action.meta.requestId);
      reducers.fullFillAddLayer(draftState, action);
      if (action.meta.arg.announce) {
        draftState.layerAddedNotice = {
          requestId: action.meta.requestId,
          layerName: action.payload.name,
          layerTitle: action.payload.title,
          hasError: action.payload.hasError,
        };
      }
    });
    builder.addCase(addLayer.rejected, (draftState, action) => {
      removePendingLayer(draftState, action.meta.requestId);
    });
  },
});

// The actions contained in the slice are exported for usage in our components
export const { actions } = ViewerSlice;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppThunkDispatch = ThunkDispatch<ViewerState, any, AnyAction>;

export const useAppDispatch = () => useDispatch<AppThunkDispatch>();
export const useAppSelector: TypedUseSelectorHook<ViewerState> = useSelector;

// A store of its own - the app uses the one below; tests make a fresh one
// each (see src/testUtils/renderWithStore.tsx), optionally starting from a
// given state.
export const createAppStore = (preloadedState?: ViewerState) =>
  configureStore({
    reducer: {
      viewer: ViewerSlice.reducer,
    },
    preloadedState,
  });

const store = createAppStore();

export default store;
