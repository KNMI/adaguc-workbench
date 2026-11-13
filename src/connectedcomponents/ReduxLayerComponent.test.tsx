import type { MockedFunction, MockInstance } from 'vitest';
import * as React from 'react';
import {
  act,
  render as renderWithoutStore,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { clearImageCacheForAllMaps } from '@opengeoweb/webmap-react';
import { createAppStore } from '../store/store';
import { thunks } from '../store/thunks';
import { ViewerState } from '../store/types';
import { emptyMap } from '../testUtils/renderWithStore';
import { ReduxLayerComponent } from './ReduxLayerComponent';
import { LayerComponentProps } from '../components/LayerComponent/LayerComponent';

vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: vi.fn(),
}));

vi.mock('@opengeoweb/webmap-react', () => ({
  clearImageCacheForAllMaps: vi.fn(),
}));

// Only the thunk the refresh dispatches is stubbed, so no GetCapabilities
// request goes out - the store itself still needs the real module (its
// slice handles fetchWMSService/addLayer's fulfilled actions).
vi.mock('../store/thunks', async (importOriginal) => {
  const original = await importOriginal<typeof import('../store/thunks')>();
  return {
    ...original,
    thunks: { ...original.thunks, fetchWMSService: vi.fn() },
  };
});

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockFetchWMSService = vi.mocked(thunks.fetchWMSService);
const mockClearImageCacheForAllMaps = vi.mocked(clearImageCacheForAllMaps);

let lastLayerComponentProps: LayerComponentProps | undefined;
// The props LayerComponent was last rendered with - failing loudly if it
// wasn't rendered at all.
const latestProps = (): LayerComponentProps => {
  if (!lastLayerComponentProps) {
    throw new Error('LayerComponent was not rendered');
  }
  return lastLayerComponentProps;
};
vi.mock('../components/LayerComponent/LayerComponent', () => ({
  LayerComponent: (props: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastLayerComponentProps = props as any;
    return null;
  },
}));

const mapId = 'map1';

const buildState = (layerIds: string[]): ViewerState => ({
  viewer: {
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: emptyMap({
        layers: layerIds.map((id) => ({
          id,
          name: id,
          serviceUrl: 'http://example.com/wms',
          style: 'default',
          dimensions: [],
          enabled: true,
          opacity: 1,
        })),
      }),
    },
  },
});

// The store the component under test was last rendered into, and every
// action dispatched to it (from the component or the test).
let store: ReturnType<typeof createAppStore>;
let mockDispatch: MockInstance;

const render = (
  state: ViewerState,
  ui: React.ReactElement,
): ReturnType<typeof renderWithoutStore> => {
  store = createAppStore(state);
  mockDispatch = vi.spyOn(store, 'dispatch');
  return renderWithoutStore(ui, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
};

const layerIdsInStore = (): string[] =>
  store.getState().viewer.maps[mapId].layers.map((layer) => layer.id);

// What the stubbed thunks.fetchWMSService hands to dispatch: a thunk that
// settles at once, without any request, so the component's own .unwrap()
// on the dispatch result works like it does in the app.
const fakeFetchWMSServiceThunk = vi.fn(() => ({
  unwrap: () => Promise.resolve(),
}));

describe('ReduxLayerComponent move up/down', () => {
  beforeEach(() => {
    lastLayerComponentProps = undefined;
    mockGetWMLayerById.mockReturnValue(undefined);
    mockFetchWMSService.mockReturnValue(fakeFetchWMSServiceThunk as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('swaps this layer with the one above it when moved up', () => {
    render(
      buildState(['a', 'b', 'c']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="b"
        layerIndex={1}
        openLayerDetails={vi.fn()}
      />,
    );

    act(() => {
      latestProps().onMoveUp();
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setLayerOrderByIds',
      payload: { mapId, layerListIds: ['b', 'a', 'c'] },
    });
    expect(layerIdsInStore()).toEqual(['b', 'a', 'c']);
  });

  it('swaps this layer with the one below it when moved down', () => {
    render(
      buildState(['a', 'b', 'c']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="b"
        layerIndex={1}
        openLayerDetails={vi.fn()}
      />,
    );

    act(() => {
      latestProps().onMoveDown();
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setLayerOrderByIds',
      payload: { mapId, layerListIds: ['a', 'c', 'b'] },
    });
    expect(layerIdsInStore()).toEqual(['a', 'c', 'b']);
  });

  it('marks the top layer as unable to move up, and the bottom layer as unable to move down', () => {
    render(
      buildState(['a', 'b', 'c']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={vi.fn()}
      />,
    );
    expect(latestProps().canMoveUp).toBe(false);
    expect(latestProps().canMoveDown).toBe(true);

    render(
      buildState(['a', 'b', 'c']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="c"
        layerIndex={2}
        openLayerDetails={vi.fn()}
      />,
    );
    expect(latestProps().canMoveUp).toBe(true);
    expect(latestProps().canMoveDown).toBe(false);
  });

  it('does nothing when asked to move past either end of the list', () => {
    render(
      buildState(['a', 'b', 'c']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={vi.fn()}
      />,
    );

    act(() => {
      latestProps().onMoveUp();
    });

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(layerIdsInStore()).toEqual(['a', 'b', 'c']);
  });
});

describe('ReduxLayerComponent refresh', () => {
  beforeEach(() => {
    lastLayerComponentProps = undefined;
    mockGetWMLayerById.mockReturnValue(undefined);
    mockFetchWMSService.mockReturnValue(fakeFetchWMSServiceThunk as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reloads the live WMLayer and re-fetches the service when refreshed', async () => {
    const mockParseLayer = vi.fn().mockResolvedValue(undefined);
    const mockOlSourceRefresh = vi.fn();
    mockGetWMLayerById.mockReturnValue({
      parseLayer: mockParseLayer,
      olSource: { refresh: mockOlSourceRefresh },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(
      buildState(['a']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={vi.fn()}
      />,
    );

    await act(() => latestProps().onRefreshLayer());

    expect(mockParseLayer).toHaveBeenCalledWith(true);
    // Regression guard: re-parsing only refreshes capabilities - the map
    // imagery itself is cached completely separately, in webmap-react's
    // shared image store, so a refresh must also clear that (and nudge
    // this layer's own OL source) or the map would keep showing the same
    // images.
    expect(mockClearImageCacheForAllMaps).toHaveBeenCalledTimes(1);
    expect(mockOlSourceRefresh).toHaveBeenCalledTimes(1);
    expect(mockFetchWMSService).toHaveBeenCalledWith('http://example.com/wms');
    expect(mockDispatch).toHaveBeenCalledWith(fakeFetchWMSServiceThunk);
  });

  it('does not touch the image store when the layer is not currently registered', async () => {
    mockGetWMLayerById.mockReturnValue(undefined);

    render(
      buildState(['a']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={vi.fn()}
      />,
    );

    await act(() => latestProps().onRefreshLayer());

    expect(mockClearImageCacheForAllMaps).not.toHaveBeenCalled();
  });

  it('still re-fetches the service when the layer is not currently registered', async () => {
    mockGetWMLayerById.mockReturnValue(undefined);

    render(
      buildState(['a']),
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={vi.fn()}
      />,
    );

    await act(() => latestProps().onRefreshLayer());

    await waitFor(() => {
      expect(mockFetchWMSService).toHaveBeenCalledWith(
        'http://example.com/wms',
      );
    });
    expect(mockDispatch).toHaveBeenCalledWith(fakeFetchWMSServiceThunk);
  });
});
