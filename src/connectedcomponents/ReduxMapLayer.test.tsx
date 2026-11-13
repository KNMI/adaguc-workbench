import * as React from 'react';
import { render } from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { useAppDispatch } from '../store/store';
import { AdagucLayer } from '../store/types';
import { AnimationTick } from './AnimationClock';
import { ReduxMapLayer } from './ReduxMapLayer';

jest.mock('@opengeoweb/webmap', () => ({
  LayerType: { mapLayer: 'mapLayer' },
  getWMLayerById: jest.fn(),
}));

jest.mock('@opengeoweb/webmap-react', () => {
  /* eslint-disable
     @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return */
  const ReactLib = require('react');
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
  /* eslint-enable
     @typescript-eslint/no-unsafe-call,
     @typescript-eslint/no-unsafe-return */
});

jest.mock('../store/store', () => ({
  actions: {
    syncAnimatedLayerDimension: (payload: unknown) => ({
      type: 'wmsservices/syncAnimatedLayerDimension',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);
// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = jest.mocked(getWMLayerById) as jest.MockedFunction<
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

const renderLayer = (
  isAnimating: boolean,
  animationTick: AnimationTick | null = null,
): ReturnType<typeof render> =>
  render(
    <ReduxMapLayer
      layer={layer}
      mapId="map1"
      layerIndex={0}
      zIndex={1}
      isAnimating={isAnimating}
      animationTick={animationTick}
      onLayerReady={jest.fn()}
      onLayerError={jest.fn()}
      onInitializeLayer={jest.fn()}
    />,
  );

describe('ReduxMapLayer animation sync', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    mockDispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockGetWMLayerById.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    mockDispatch.mockClear();

    rerender(
      <ReduxMapLayer
        layer={layer}
        mapId="map1"
        layerIndex={0}
        zIndex={1}
        isAnimating
        animationTick={tickAt('2025-01-01T01:00:00Z')}
        onLayerReady={jest.fn()}
        onLayerError={jest.fn()}
        onInitializeLayer={jest.fn()}
      />,
    );

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/syncAnimatedLayerDimension',
      payload: {
        mapId: 'map1',
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T01:00:00Z',
      },
    });
  });

  it("snaps the shared tick's time to this layer's own closest matching dimension value", () => {
    // Regression guard: the shared tick comes from whichever layer drives
    // the clock, which may have a different time resolution/range than
    // this layer - it must be snapped to this layer's own dimension values
    // instead of applied as-is.
    const fakeTimeDimension = {
      getClosestValue: jest.fn(() => '2025-01-01T00:30:00Z'),
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
  });

  it('does nothing while not animating', () => {
    renderLayer(false, null);

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('does nothing while animating but no tick has arrived yet', () => {
    renderLayer(true, null);

    expect(mockDispatch).not.toHaveBeenCalled();
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
