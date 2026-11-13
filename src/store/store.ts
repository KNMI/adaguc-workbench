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
    builder.addCase(addLayer.fulfilled, reducers.fullFillAddLayer);
  },
});

// The actions contained in the slice are exported for usage in our components
export const { actions } = ViewerSlice;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppThunkDispatch = ThunkDispatch<ViewerState, any, AnyAction>;

export const useAppDispatch = () => useDispatch<AppThunkDispatch>();
export const useAppSelector: TypedUseSelectorHook<ViewerState> = useSelector;

const store = configureStore({
  reducer: {
    viewer: ViewerSlice.reducer,
  },
});

export default store;
