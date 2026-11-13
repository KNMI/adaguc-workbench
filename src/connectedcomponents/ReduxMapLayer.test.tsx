import type { MockedFunction, MockInstance } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { createAppStore } from '../store/store';
import { AdagucLayer } from '../store/types';
import { emptyMap } from '../testUtils/renderWithStore';
import { AnimationTick } from './AnimationClock';
import { ReduxMapLayer } from './ReduxMapLayer';

vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: vi.fn(),
}));

vi.mock('@opengeoweb/webmap-react', async () => {
  const ReactLib = await import('react');
  const MockTimeContext = ReactLib.createContext({});
  return {
    // Reads the context value back out and exposes it, so a test can
    // verify what AnimatedMapLayer actually provides through it. Also
    // exposes the extentRatio it was given, so a test can verify what
    // getLayerProps actually passed through.
    OpenLayersLayer: (props: { extentRatio?: number }) => {
      const timeContextValue = ReactLib.useContext(MockTimeContext);
      return ReactLib.createElement(
        'div',
        {
          'data-testid': 'time-context-value',
          'data-extent-ratio': props.extentRatio,
        },
        JSON.stringify(timeContextValue),
      );
    },
    TimeContext: MockTimeContext,
  };
});

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;

const layer: AdagucLayer = {
  id: 'layer-1',
  name: 'air_pressure_msl',
  serviceUrl: 'http://localhost:8080/adagucserver',
  style: 'default',
  dimensions: [],
  enabled: true,
  opacity: 1,
};

const tickAt = (time: string): AnimationTick => ({
  time,
  timeContext: { isAnimating: true, prefetchList: [1, 2, 3] },
});

const layerElement = (
  isAnimating: boolean,
  animationTick: AnimationTick | null,
): React.ReactElement => (
  <ReduxMapLayer
    layer={layer}
    mapId="map1"
    layerIndex={0}
    zIndex={1}
    isAnimating={isAnimating}
    animationTick={animationTick}
    onLayerReady={vi.fn()}
    onLayerError={vi.fn()}
    onInitializeLayer={vi.fn()}
  />
);

// The store the layer under test was last rendered into, and every action
// dispatched to it. The store's map holds the same layer the component is
// given as a prop, as it would in the app.
let store: ReturnType<typeof createAppStore>;
let mockDispatch: MockInstance;

const renderLayer = (
  isAnimating: boolean,
  animationTick: AnimationTick | null = null,
): ReturnType<typeof render> => {
  store = createAppStore({
    viewer: {
      maps: { map1: emptyMap({ isAnimating, layers: [layer] }) },
      services: {},
      baseLayers: [],
    },
  });
  mockDispatch = vi.spyOn(store, 'dispatch');
  return render(layerElement(isAnimating, animationTick), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
};

const timeInStore = (): string | undefined =>
  store
    .getState()
    .viewer.maps.map1.layers[0].dimensions.find((dim) => dim.name === 'time')
    ?.currentValue;

describe('ReduxMapLayer animation sync', () => {
  beforeEach(() => {
    mockGetWMLayerById.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches each shared animation tick into redux, so the time slider follows it', () => {
    // Regression guard: useAnimationForLayer only drives the map's own
    // rendering internally - it never touched redux, so the sidebar's time
    // slider (which reads the layer's redux-tracked dimensions) never
    // updated while an animation was running.
    const { rerender } = renderLayer(true, tickAt('2025-01-01T00:00:00Z'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/syncAnimatedLayerDimension',
      payload: {
        mapId: 'map1',
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T00:00:00Z',
      },
    });
    expect(timeInStore()).toBe('2025-01-01T00:00:00Z');

    mockDispatch.mockClear();

    rerender(layerElement(true, tickAt('2025-01-01T01:00:00Z')));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/syncAnimatedLayerDimension',
      payload: {
        mapId: 'map1',
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T01:00:00Z',
      },
    });
    expect(timeInStore()).toBe('2025-01-01T01:00:00Z');
    // Syncing the animated time must not stop the animation itself.
    expect(store.getState().viewer.maps.map1.isAnimating).toBe(true);
  });

  it("snaps the shared tick's time to this layer's own closest matching dimension value", () => {
    // Regression guard: the shared tick comes from whichever layer drives
    // the clock, which may have a different time resolution/range than
    // this layer - it must be snapped to this layer's own dimension values
    // instead of applied as-is.
    const fakeTimeDimension = {
      getClosestValue: vi.fn(() => '2025-01-01T00:30:00Z'),
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderLayer(true, tickAt('2025-01-01T00:34:00Z'));

    expect(fakeTimeDimension.getClosestValue).toHaveBeenCalledWith(
      '2025-01-01T00:34:00Z',
      true,
    );
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/syncAnimatedLayerDimension',
      payload: {
        mapId: 'map1',
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T00:30:00Z',
      },
    });
    expect(timeInStore()).toBe('2025-01-01T00:30:00Z');
  });

  it('does nothing while not animating', () => {
    renderLayer(false, null);

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(timeInStore()).toBeUndefined();
  });

  it('does nothing while animating but no tick has arrived yet', () => {
    renderLayer(true, null);

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(timeInStore()).toBeUndefined();
  });

  it("provides the shared tick's prefetch info via TimeContext, so upcoming frames get prefetched instead of fetched cold", () => {
    // Regression guard: TimeawareImageSourceWMSLayer (what OpenLayersLayer
    // renders for a WMS layer) only prefetches upcoming animation frames
    // when it reads isAnimating/prefetchList from this context - without a
    // provider, every tick fell back to a cold GetMap request, which is
    // what made the animation feel slow.
    const { getByTestId } = renderLayer(true, tickAt('2025-01-01T00:00:00Z'));

    expect(
      JSON.parse(getByTestId('time-context-value').textContent || ''),
    ).toEqual({ isAnimating: true, prefetchList: [1, 2, 3] });
  });

  it('requests WMS imagery at exactly the view extent (extentRatio 1), not padded', () => {
    // webmap-react defaults to fetching imagery 1.2x the view extent for a
    // panning margin - this app opts out of that margin instead. Each
    // render's own container is queried directly (rather than the shared
    // document body via getByTestId) since both stay mounted at once.
    const { container: staticContainer, unmount } = renderLayer(false, null);
    expect(
      staticContainer.querySelector('[data-testid="time-context-value"]'),
    ).toHaveAttribute('data-extent-ratio', '1');
    unmount();

    const { container: animatedContainer } = renderLayer(
      true,
      tickAt('2025-01-01T00:00:00Z'),
    );
    expect(
      animatedContainer.querySelector('[data-testid="time-context-value"]'),
    ).toHaveAttribute('data-extent-ratio', '1');
  });
});
