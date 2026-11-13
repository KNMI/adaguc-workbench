import * as React from 'react';
import { render, waitFor } from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { clearImageCacheForAllMaps } from '@opengeoweb/webmap-react';
import { useAppDispatch, useAppSelector } from '../store/store';
import { thunks } from '../store/thunks';
import { ViewerState } from '../store/types';
import { ReduxLayerComponent } from './ReduxLayerComponent';
import { LayerComponentProps } from '../components/LayerComponent/LayerComponent';

jest.mock('@opengeoweb/webmap', () => ({
  generateLayerId: jest.fn(() => 'new-layer-id'),
  getWMLayerById: jest.fn(),
}));

jest.mock('@opengeoweb/webmap-react', () => ({
  clearImageCacheForAllMaps: jest.fn(),
}));

jest.mock('../store/thunks', () => ({
  thunks: { fetchWMSService: jest.fn() },
}));

jest.mock('../store/store', () => ({
  actions: {
    setLayerOrderByIds: (payload: unknown) => ({
      type: 'wmsservices/setLayerOrderByIds',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = jest.mocked(getWMLayerById) as jest.MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockFetchWMSService = jest.mocked(thunks.fetchWMSService);
const mockClearImageCacheForAllMaps = jest.mocked(clearImageCacheForAllMaps);

let lastLayerComponentProps: LayerComponentProps | undefined;
// The props LayerComponent was last rendered with - failing loudly if it
// wasn't rendered at all.
const latestProps = (): LayerComponentProps => {
  if (!lastLayerComponentProps) {
    throw new Error('LayerComponent was not rendered');
  }
  return lastLayerComponentProps;
};
jest.mock('../components/LayerComponent/LayerComponent', () => ({
  LayerComponent: (props: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastLayerComponentProps = props as any;
    return null;
  },
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockUseAppSelector = jest.mocked(useAppSelector);

const mapId = 'map1';

const buildState = (layerIds: string[]): ViewerState => ({
  viewer: {
    services: {},
    baseLayers: [],
    maps: {
      [mapId]: {
        isAnimating: false,
        isGetFeatureInfoActive: false,
        isHistogramBoxSelectActive: false,
        layers: layerIds.map((id) => ({
          id,
          name: id,
          serviceUrl: 'http://example.com/wms',
          style: 'default',
          dimensions: [],
          enabled: true,
          opacity: 1,
        })),
        view: {
          srs: 'EPSG:3857',
          bbox: { left: -1, bottom: -1, right: 1, top: 1 },
        },
      },
    },
  },
});

describe('ReduxLayerComponent move up/down', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    lastLayerComponentProps = undefined;
    mockDispatch = jest.fn().mockReturnValue({
      unwrap: () => Promise.resolve(),
    });
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockGetWMLayerById.mockReturnValue(undefined);
    mockFetchWMSService.mockImplementation(
      (serviceUrl: unknown) =>
        ({ type: 'services/fetchWMSService', payload: serviceUrl }) as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('swaps this layer with the one above it when moved up', () => {
    const state = buildState(['a', 'b', 'c']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="b"
        layerIndex={1}
        openLayerDetails={jest.fn()}
      />,
    );

    latestProps().onMoveUp();

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setLayerOrderByIds',
      payload: { mapId, layerListIds: ['b', 'a', 'c'] },
    });
  });

  it('swaps this layer with the one below it when moved down', () => {
    const state = buildState(['a', 'b', 'c']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="b"
        layerIndex={1}
        openLayerDetails={jest.fn()}
      />,
    );

    latestProps().onMoveDown();

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/setLayerOrderByIds',
      payload: { mapId, layerListIds: ['a', 'c', 'b'] },
    });
  });

  it('marks the top layer as unable to move up, and the bottom layer as unable to move down', () => {
    const state = buildState(['a', 'b', 'c']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={jest.fn()}
      />,
    );
    expect(latestProps().canMoveUp).toBe(false);
    expect(latestProps().canMoveDown).toBe(true);

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="c"
        layerIndex={2}
        openLayerDetails={jest.fn()}
      />,
    );
    expect(latestProps().canMoveUp).toBe(true);
    expect(latestProps().canMoveDown).toBe(false);
  });

  it('does nothing when asked to move past either end of the list', () => {
    const state = buildState(['a', 'b', 'c']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={jest.fn()}
      />,
    );

    latestProps().onMoveUp();

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('ReduxLayerComponent refresh', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    lastLayerComponentProps = undefined;
    mockDispatch = jest.fn().mockReturnValue({
      unwrap: () => Promise.resolve(),
    });
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockGetWMLayerById.mockReturnValue(undefined);
    mockFetchWMSService.mockImplementation(
      (serviceUrl: unknown) =>
        ({ type: 'services/fetchWMSService', payload: serviceUrl }) as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reloads the live WMLayer and re-fetches the service when refreshed', async () => {
    const state = buildState(['a']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));
    const mockParseLayer = jest.fn().mockResolvedValue(undefined);
    const mockOlSourceRefresh = jest.fn();
    mockGetWMLayerById.mockReturnValue({
      parseLayer: mockParseLayer,
      olSource: { refresh: mockOlSourceRefresh },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={jest.fn()}
      />,
    );

    await latestProps().onRefreshLayer();

    expect(mockParseLayer).toHaveBeenCalledWith(true);
    // Regression guard: re-parsing only refreshes capabilities - the map
    // imagery itself is cached completely separately, in webmap-react's
    // shared image store, so a refresh must also clear that (and nudge
    // this layer's own OL source) or the map would keep showing the same
    // images.
    expect(mockClearImageCacheForAllMaps).toHaveBeenCalledTimes(1);
    expect(mockOlSourceRefresh).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'services/fetchWMSService',
      payload: 'http://example.com/wms',
    });
  });

  it('does not touch the image store when the layer is not currently registered', async () => {
    const state = buildState(['a']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));
    mockGetWMLayerById.mockReturnValue(undefined);

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={jest.fn()}
      />,
    );

    await latestProps().onRefreshLayer();

    expect(mockClearImageCacheForAllMaps).not.toHaveBeenCalled();
  });

  it('still re-fetches the service when the layer is not currently registered', async () => {
    const state = buildState(['a']);
    mockUseAppSelector.mockImplementation((selector) => selector(state));
    mockGetWMLayerById.mockReturnValue(undefined);

    render(
      <ReduxLayerComponent
        mapId={mapId}
        layerId="a"
        layerIndex={0}
        openLayerDetails={jest.fn()}
      />,
    );

    await latestProps().onRefreshLayer();

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'services/fetchWMSService',
        payload: 'http://example.com/wms',
      });
    });
  });
});
