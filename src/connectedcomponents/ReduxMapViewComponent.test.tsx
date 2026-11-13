import type { Mock, MockedFunction, MockInstance } from 'vitest';
import * as React from 'react';
import { act, render as renderWithoutStore } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  getLayerExtentForProjection,
  makeView,
  useAnimationForLayer,
} from '@opengeoweb/webmap-react';
import { LayerType, getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { get as getOlProjection } from 'ol/proj';
import { actions, createAppStore } from '../store/store';
import { AdagucLayer, ViewerState } from '../store/types';
import { emptyMap } from '../testUtils/renderWithStore';
import { ReduxMapViewComponent } from './ReduxMapViewComponent';
import { fitViewToBbox } from '../utils/fitViewToBbox';

// Needs a real OpenLayers map - its own behaviour is covered by
// OpenLayersHistogramBoxSelect's own test file instead.
vi.mock('./OpenLayersHistogramBoxSelect', () => ({
  default: () => null,
}));

// Lets each test decide which srs's OpenLayers knows - by default, all.
vi.mock('ol/proj', () => ({
  get: vi.fn(() => ({})),
}));

vi.mock('../utils/fitViewToBbox', () => ({
  fitViewToBbox: vi.fn(),
}));

vi.mock('../utils/registerExtraProjections', () => ({
  registerExtraProjections: vi.fn(),
}));

// The layers' capabilities come from opengeoweb's WMLayer registry, which
// only gets filled in by a real map - tests stub it instead.
vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: vi.fn(),
}));

// A newly created view isn't attached to the map yet, so OpenLayersMapView
// (the real implementation) is what gives it its correct pixel size, by
// calling map.setView() in its own effect when the `view` prop changes.
// This stand-in simulates exactly that one behaviour - everything else
// about the real map is irrelevant to the regression being guarded here.
let mockAttachViewToMap: Mock;
// Records every <OpenLayersLayer> render's props, so tests can inspect the
// zIndex each data layer is actually given (see layer-ordering tests below)
// without needing a real OL map to observe real draw order from.
let mockOpenLayersLayerCalls: Array<{
  id?: string;
  zIndex?: number;
  dimensions?: unknown;
}>;
vi.mock('@opengeoweb/webmap-react', async () => {
  /* eslint-disable
     @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-explicit-any */
  const ReactLib = await import('react');
  return {
    OpenLayersMapView: ({ view, children }: any) => {
      ReactLib.useEffect(() => {
        mockAttachViewToMap(view);
      }, [view]);
      return children;
    },
    OpenLayersLayer: (props: any) => {
      mockOpenLayersLayerCalls.push(props);
      return null;
    },
    OpenLayersGetFeatureInfo: () => null,
    getLayerExtentForProjection: vi.fn(),
    makeView: vi.fn(),
    useAnimationForLayer: vi.fn(() => ({ dimensions: [] })),
    TimeContext: ReactLib.createContext({}),
  };
  /* eslint-enable
     @typescript-eslint/no-unsafe-return,
     @typescript-eslint/no-explicit-any */
});

const mockMakeView = vi.mocked(makeView);
const mockFitViewToBbox = vi.mocked(fitViewToBbox);
const mockGetLayerExtentForProjection = vi.mocked(getLayerExtentForProjection);
const mockUseAnimationForLayer = vi.mocked(useAnimationForLayer);
// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;
const mockGetOlProjection = vi.mocked(getOlProjection);

const mapId = 'map1';

// A minimal stand-in for an OL View: just enough for ReduxMapViewComponent's
// other effects (the view-change listener) to attach/detach without
// throwing; nothing in this test exercises real OL view behaviour.
const makeFakeView = (): unknown => ({ on: vi.fn(), un: vi.fn() });

describe('ReduxMapViewComponent', () => {
  // The state a test starts from - render() creates a real store with it.
  let initialState: ViewerState;
  let store: ReturnType<typeof createAppStore>;
  // Every action dispatched, from the component or the test itself - the
  // real reducer still runs for each one.
  let mockDispatch: MockInstance;
  let callOrder: string[];

  const render = (ui: React.ReactElement) => {
    store = createAppStore(initialState);
    mockDispatch = vi.spyOn(store, 'dispatch');
    return renderWithoutStore(ui, {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
  };

  // A projection switch, as the projection selector requests it.
  const requestSetProjection = (
    srs: string,
    bbox = { left: 0, bottom: 0, right: 1, top: 1 },
  ): void => {
    act(() => {
      store.dispatch(actions.requestSetProjection({ mapId, srs, bbox }));
    });
  };

  // The map's view as it currently is in redux (and so the permalink).
  const reduxView = () => store.getState().viewer.maps[mapId].view;

  beforeEach(() => {
    callOrder = [];
    mockOpenLayersLayerCalls = [];
    mockGetWMLayerById.mockReturnValue(undefined);
    mockGetOlProjection.mockImplementation(
      () => ({}) as ReturnType<typeof getOlProjection>,
    );
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockMakeView.mockImplementation(() => {
      const view = makeFakeView();
      callOrder.push('makeView');
      return view as ReturnType<typeof makeView>;
    });
    mockAttachViewToMap = vi.fn((view: unknown) => {
      callOrder.push('attachViewToMap');
      return view;
    });
    mockFitViewToBbox.mockImplementation(() => {
      callOrder.push('fitViewToBbox');
    });

    initialState = {
      viewer: {
        services: {},
        baseLayers: [],
        maps: { [mapId]: emptyMap() },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('attaches a new view to the map before fitting it to a viewCommand bbox', () => {
    render(<ReduxMapViewComponent mapId={mapId} />);
    // The initial mount already creates and attaches a default view; only
    // the calls triggered by the viewCommand below are under test.
    callOrder.length = 0;

    const bbox = { left: 10, bottom: 20, right: 30, top: 40 };
    requestSetProjection('EPSG:28992', bbox);

    expect(callOrder).toEqual(['makeView', 'attachViewToMap', 'fitViewToBbox']);

    // Fitting must happen on the exact view that was created for this
    // viewCommand and attached to the map - not on some other view (e.g.
    // the initial default one from mount, attached once before this).
    const lastAttachCall =
      mockAttachViewToMap.mock.calls[mockAttachViewToMap.mock.calls.length - 1];
    const attachedView = lastAttachCall[0];
    const [fittedView, fittedBbox] = mockFitViewToBbox.mock.calls[0];
    expect(fittedView).toBe(attachedView);
    expect(fittedBbox).toEqual(bbox);
  });

  it('syncs the new srs/bbox to redux right after switching projections, without needing a later pan', () => {
    // The map itself reads the live OL view directly, so it always shows
    // the switch immediately - but redux (and so the permalink) previously
    // only ever learned about it from a later 'change' event, which the
    // fit triggered by the switch itself can fire before anything has
    // subscribed to this new view, and which otherwise never fires again
    // without the user panning/zooming afterwards.
    mockMakeView.mockImplementationOnce(
      () => makeFakeView() as ReturnType<typeof makeView>,
    );
    const fittedView = {
      on: vi.fn(),
      un: vi.fn(),
      calculateExtent: vi.fn(() => [10, 20, 30, 40]),
      getProjection: vi.fn(() => ({ getCode: () => 'EPSG:28992' })),
    };
    mockMakeView.mockImplementationOnce(
      () => fittedView as unknown as ReturnType<typeof makeView>,
    );

    render(<ReduxMapViewComponent mapId={mapId} />);

    requestSetProjection('EPSG:28992');

    expect(reduxView()).toEqual({
      srs: 'EPSG:28992',
      bbox: { left: 10, bottom: 20, right: 30, top: 40 },
    });
  });

  it('syncs the fitted extent to redux right after a zoom-to-layer command, without needing a later pan', () => {
    // Regression guard: view.fit() here fires the view's 'change' event
    // synchronously, same as the viewCommand bbox-fit above - the map
    // itself visibly zoomed to the layer either way (it reads the live OL
    // view directly), but without an explicit sync here, redux (and so the
    // permalink) kept advertising the view from before the zoom, since
    // nothing else ever told it about this fit.
    const fittedView = {
      on: vi.fn(),
      un: vi.fn(),
      fit: vi.fn(),
      calculateExtent: vi.fn(() => [10, 20, 30, 40]),
      getProjection: vi.fn(() => ({ getCode: () => 'EPSG:3857' })),
    };
    mockMakeView.mockImplementation(
      () => fittedView as unknown as ReturnType<typeof makeView>,
    );
    mockGetWMLayerById.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );
    mockGetLayerExtentForProjection.mockReturnValue([1, 2, 3, 4]);

    render(<ReduxMapViewComponent mapId={mapId} />);

    act(() => {
      store.dispatch(actions.requestZoomToLayer({ mapId, layerId: 'layer-1' }));
    });

    expect(fittedView.fit).toHaveBeenCalledWith([1, 2, 3, 4]);
    expect(reduxView()).toEqual({
      srs: 'EPSG:3857',
      bbox: { left: 10, bottom: 20, right: 30, top: 40 },
    });
  });

  it('does not dispatch a stale srs/bbox left over from the previous view after switching projections', () => {
    vi.useFakeTimers();

    const onMock = vi.fn<(event: string, handler: () => void) => void>();
    const makeFakeViewWithSrs = (srs: string, extent: number[]): unknown => ({
      on: onMock,
      un: vi.fn(),
      calculateExtent: vi.fn(() => extent),
      getProjection: vi.fn(() => ({ getCode: () => srs })),
    });
    const viewV1 = makeFakeViewWithSrs('EPSG:3857', [1, 2, 3, 4]);
    const viewV2 = makeFakeViewWithSrs('EPSG:28992', [5, 6, 7, 8]);
    mockMakeView
      .mockImplementationOnce(() => viewV1 as ReturnType<typeof makeView>)
      .mockImplementationOnce(() => viewV2 as ReturnType<typeof makeView>);

    render(<ReduxMapViewComponent mapId={mapId} />);

    // Simulate the user having just panned/zoomed on the old view right
    // before switching projections - this arms its 200ms debounce timer.
    const v1ChangeCall = onMock.mock.calls.find(
      ([event]) => event === 'change',
    );
    const v1ChangeHandler = v1ChangeCall?.[1];
    act(() => {
      v1ChangeHandler?.();
    });

    // Switching projections swaps in viewV2 - the old view's still-pending
    // debounce from above must not survive this.
    requestSetProjection('EPSG:28992');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          view: expect.objectContaining({ srs: 'EPSG:3857' }),
        }),
      }),
    );
    expect(reduxView()).toEqual({
      srs: 'EPSG:28992',
      bbox: { left: 5, bottom: 6, right: 7, top: 8 },
    });

    vi.useRealTimers();
  });

  it('keeps the current view, without crashing, when asked to switch to an srs OpenLayers does not know', () => {
    // Regression guard: makeView throws ("Cannot read properties of null
    // (reading 'getExtent')") for an srs with no proj4 definition, e.g.
    // one picked from a layer's projection table or carried in a
    // permalink - which used to take the whole app down.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetOlProjection.mockImplementation((srs) =>
      srs === 'EPSG:9999' ? null : ({} as ReturnType<typeof getOlProjection>),
    );
    render(<ReduxMapViewComponent mapId={mapId} />);
    callOrder.length = 0;

    requestSetProjection('EPSG:9999');

    expect(callOrder).toEqual([]);
    expect(reduxView().srs).toBe('EPSG:3857');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EPSG:9999'));
    warn.mockRestore();
  });

  it('does not re-fit when the component re-renders without a new viewCommand', () => {
    const { rerender } = render(<ReduxMapViewComponent mapId={mapId} />);

    act(() => {
      rerender(<ReduxMapViewComponent mapId={mapId} />);
    });

    expect(mockFitViewToBbox).not.toHaveBeenCalled();

    // A handled viewCommand stays in the store - later state changes (here
    // the user panning, which updates the view in redux) re-render with
    // that same command, which must not fit the view to it again.
    requestSetProjection('EPSG:28992');
    expect(mockFitViewToBbox).toHaveBeenCalledTimes(1);

    act(() => {
      store.dispatch(
        actions.updateMapView({
          mapId,
          view: {
            srs: 'EPSG:28992',
            bbox: { left: 100, bottom: 200, right: 300, top: 400 },
          },
        }),
      );
    });

    expect(mockFitViewToBbox).toHaveBeenCalledTimes(1);
  });

  it('draws enabled base layers below the data layers and enabled overlays above them', () => {
    initialState.viewer.baseLayers = [
      {
        id: 'baselayer-worldmap',
        name: 'WorldMap',
        title: 'KNMI Basemap',
        layerType: LayerType.baseLayer,
        enabled: true,
      },
      {
        id: 'baselayer-arcgis-sat',
        name: 'arcGisSat',
        title: 'ESRI ArcGIS Satellite',
        layerType: LayerType.baseLayer,
        enabled: false,
      },
      {
        id: 'overlay-countryborders',
        name: 'countryborders',
        title: 'World country borders',
        layerType: LayerType.overLayer,
        enabled: true,
      },
    ];
    const dataLayer: AdagucLayer = {
      id: 'layer-data',
      name: 'Data layer',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    initialState.viewer.maps[mapId].layers = [dataLayer];

    render(<ReduxMapViewComponent mapId={mapId} />);

    // Regression guard: webmap-react's OpenLayersLayer hardcodes
    // `enabled: true` internally for any `type: 'twms'` base/overlay layer
    // (every Baselayers-tab preset), silently ignoring whatever `enabled`
    // is actually passed to it - so a disabled preset must not be rendered
    // at all, rather than rendered and trusted to stay hidden.
    const renderedIds = new Set(
      mockOpenLayersLayerCalls.map((call) => call.id),
    );
    expect(renderedIds.has('baselayer-worldmap')).toBe(true);
    expect(renderedIds.has('baselayer-arcgis-sat')).toBe(false);

    const zIndexById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.zIndex]),
    );
    expect(zIndexById.get('baselayer-worldmap') ?? NaN).toBeLessThan(
      zIndexById.get('layer-data') ?? NaN,
    );
    expect(zIndexById.get('layer-data') ?? NaN).toBeLessThan(
      zIndexById.get('overlay-countryborders') ?? NaN,
    );
  });

  it('draws the layer at the top of the list above the ones below it', () => {
    const topLayer: AdagucLayer = {
      id: 'layer-top',
      name: 'Top layer',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    const bottomLayer: AdagucLayer = {
      id: 'layer-bottom',
      name: 'Bottom layer',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    // Index 0 is the top of the sidebar layer list (see SortableLayerList),
    // so it must end up with the highest zIndex on the map.
    initialState.viewer.maps[mapId].layers = [topLayer, bottomLayer];

    render(<ReduxMapViewComponent mapId={mapId} />);

    const zIndexById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.zIndex]),
    );

    expect(zIndexById.get('layer-top') ?? NaN).toBeGreaterThan(
      zIndexById.get('layer-bottom') ?? NaN,
    );
  });

  it('re-draws layers in the new order after they are reordered in the list', () => {
    const layerA: AdagucLayer = {
      id: 'layer-a',
      name: 'Layer A',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    const layerB: AdagucLayer = {
      id: 'layer-b',
      name: 'Layer B',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    initialState.viewer.maps[mapId].layers = [layerA, layerB];
    render(<ReduxMapViewComponent mapId={mapId} />);

    const initialZIndexById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.zIndex]),
    );
    expect(initialZIndexById.get('layer-a') ?? NaN).toBeGreaterThan(
      initialZIndexById.get('layer-b') ?? NaN,
    );

    // Drag layer-b to the top of the list.
    mockOpenLayersLayerCalls = [];
    act(() => {
      store.dispatch(
        actions.setLayerOrderByIds({
          mapId,
          layerListIds: ['layer-b', 'layer-a'],
        }),
      );
    });

    const reorderedZIndexById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.zIndex]),
    );
    expect(reorderedZIndexById.get('layer-b') ?? NaN).toBeGreaterThan(
      reorderedZIndexById.get('layer-a') ?? NaN,
    );
  });

  it('drives every animated layer from the same shared animation tick', () => {
    // Regression guard: each animated layer used to call
    // useAnimationForLayer itself, each with its own independent timer -
    // since those timers aren't synchronised with each other, layers
    // visibly updated at slightly different moments. Mounting a single
    // AnimationClock and broadcasting its tick to every layer keeps them
    // moving in lockstep, since they all then re-render from the same tick.
    const layerA: AdagucLayer = {
      id: 'layer-a',
      name: 'Layer A',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    const layerB: AdagucLayer = {
      id: 'layer-b',
      name: 'Layer B',
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [],
      enabled: true,
      opacity: 1,
    };
    initialState.viewer.maps[mapId].layers = [layerA, layerB];
    initialState.viewer.maps[mapId].isAnimating = true;

    const fakeTimeDimension = {
      getClosestValue: vi.fn((value: string) => value),
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
      timeContext: { isAnimating: true, prefetchList: [] },
    });

    act(() => {
      render(<ReduxMapViewComponent mapId={mapId} />);
    });

    // A single shared clock drives the ticking - it is only ever given
    // layer-a (the first layer with a time dimension), never layer-b, even
    // though layer-b also animates.
    const clockedLayerIds = new Set(
      mockUseAnimationForLayer.mock.calls.map(
        (call) => (call[0] as { id?: string }).id,
      ),
    );
    expect(clockedLayerIds).toEqual(new Set(['layer-a']));

    const dimensionsById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.dimensions]),
    );
    expect(dimensionsById.get('layer-a')).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
    expect(dimensionsById.get('layer-b')).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
  });

  it("clocks the animation from the layer whose Play was pressed, animating only that layer when it isn't linked", () => {
    // Regression guard: the clock always used the first layer with a time
    // dimension, so pressing Play on another layer stepped through the
    // first layer's time values instead of its own.
    const timeLayer = (id: string): AdagucLayer => ({
      id,
      name: id,
      serviceUrl: 'http://example.com/wms',
      style: 'default',
      dimensions: [{ name: 'time', currentValue: '2024-06-01T00:00:00Z' }],
      enabled: true,
      opacity: 1,
    });
    initialState.viewer.maps[mapId].layers = [
      timeLayer('layer-a'),
      timeLayer('layer-b'),
    ];
    initialState.viewer.maps[mapId].isAnimating = true;
    initialState.viewer.maps[mapId].animation = {
      layerId: 'layer-b',
      scope: 'group',
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time'
          ? {
              getClosestValue: vi.fn((value: string) => value),
              // The clock's own starting point - "unknown" is fine here.
              getIndexForValue: vi.fn(() => -1),
            }
          : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
      timeContext: { isAnimating: true, prefetchList: [] },
    });

    act(() => {
      render(<ReduxMapViewComponent mapId={mapId} />);
    });

    const clockedLayerIds = new Set(
      mockUseAnimationForLayer.mock.calls.map(
        (call) => (call[0] as { id?: string }).id,
      ),
    );
    expect(clockedLayerIds).toEqual(new Set(['layer-b']));
    const dimensionsById = new Map(
      mockOpenLayersLayerCalls.map((call) => [call.id, call.dimensions]),
    );
    // layer-b follows the animation; layer-a (not linked) keeps its own time.
    expect(dimensionsById.get('layer-b')).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
    expect(dimensionsById.get('layer-a')).toEqual([
      { name: 'time', currentValue: '2024-06-01T00:00:00Z' },
    ]);
    // The animated time is mirrored back into redux (for the sidebar's
    // time slider) for the animated layer only.
    const [reduxLayerA, reduxLayerB] =
      store.getState().viewer.maps[mapId].layers;
    expect(reduxLayerB.dimensions).toEqual([
      { name: 'time', currentValue: '2025-01-01T00:00:00Z' },
    ]);
    expect(reduxLayerA.dimensions).toEqual([
      { name: 'time', currentValue: '2024-06-01T00:00:00Z' },
    ]);
    expect(store.getState().viewer.maps[mapId].isAnimating).toBe(true);
  });
});
