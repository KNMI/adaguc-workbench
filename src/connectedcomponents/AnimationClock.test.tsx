import type { MockedFunction } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { useAnimationForLayer } from '@opengeoweb/webmap-react';
import { AdagucLayer } from '../store/types';
import { AnimationClock, getNumStepsFromCurrentTime } from './AnimationClock';

vi.mock('@opengeoweb/webmap', () => ({
  LayerType: { mapLayer: 'mapLayer' },
  getWMLayerById: vi.fn(),
}));

vi.mock('@opengeoweb/webmap-react', () => ({
  useAnimationForLayer: vi.fn(),
}));

const mockUseAnimationForLayer = vi.mocked(useAnimationForLayer);
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

describe('getNumStepsFromCurrentTime', () => {
  beforeEach(() => {
    mockGetWMLayerById.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts the animation from the layer's currently selected time, not the library default", () => {
    // Regression guard: useAnimationForLayer always loops over its last N
    // steps counted back from the dimension's latest value, with no way to
    // tell it "start from wherever the slider is" - so starting an
    // animation used to always jump to a fixed recent window. Passing it
    // size-of-window-from-the-current-index instead reproduces the same
    // looping behaviour, but starting where the user left it.
    const layerAtStep10: AdagucLayer = {
      ...layer,
      dimensions: [{ name: 'time', currentValue: '2025-01-01T10:00:00Z' }],
    };
    const fakeTimeDimension = {
      getIndexForValue: vi.fn(() => 10),
      size: vi.fn(() => 24),
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // size(24) - currentIndex(10) = 14 steps from "now" through to latest.
    expect(getNumStepsFromCurrentTime(layerAtStep10)).toBe(14);
  });

  it('falls back to the default animation window when the current time cannot be resolved', () => {
    expect(getNumStepsFromCurrentTime(layer)).toBe(24);
  });

  it('still animates at least 12 steps when the slider is sitting at the latest value', () => {
    // Regression guard: size(24) - currentIndex(23) = 1, which used to be
    // passed straight through - a 1-step animation window looks like
    // nothing happens at all when pressing animate at the end of the
    // slider.
    const layerAtLatestStep: AdagucLayer = {
      ...layer,
      dimensions: [{ name: 'time', currentValue: '2025-01-01T23:00:00Z' }],
    };
    const fakeTimeDimension = {
      getIndexForValue: vi.fn(() => 23),
      size: vi.fn(() => 24),
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(getNumStepsFromCurrentTime(layerAtLatestStep)).toBe(12);
  });

  it('does not ask for more steps than the dimension actually has', () => {
    // Only 5 time steps exist in total - 12 isn't achievable, so the whole
    // dimension is the best this can offer.
    const layerWithFewSteps: AdagucLayer = {
      ...layer,
      dimensions: [{ name: 'time', currentValue: '2025-01-01T04:00:00Z' }],
    };
    const fakeTimeDimension = {
      getIndexForValue: vi.fn(() => 4),
      size: vi.fn(() => 5),
    };
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) =>
        name === 'time' ? fakeTimeDimension : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(getNumStepsFromCurrentTime(layerWithFewSteps)).toBe(5);
  });
});

describe('AnimationClock', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports each animated time step via onTick', () => {
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
      timeContext: { isAnimating: true, prefetchList: [1, 2, 3] },
    });
    const onTick = vi.fn();

    render(<AnimationClock layer={layer} onTick={onTick} />);

    expect(onTick).toHaveBeenCalledWith({
      time: '2025-01-01T00:00:00Z',
      timeContext: { isAnimating: true, prefetchList: [1, 2, 3] },
    });
  });

  it('does not report a tick when the time dimension has no current value yet', () => {
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [],
      timeContext: { isAnimating: true, prefetchList: [] },
    });
    const onTick = vi.fn();

    render(<AnimationClock layer={layer} onTick={onTick} />);

    expect(onTick).not.toHaveBeenCalled();
  });

  it('renders nothing itself - it only drives ticks', () => {
    mockUseAnimationForLayer.mockReturnValue({
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
      timeContext: { isAnimating: true, prefetchList: [] },
    });

    const { container } = render(
      <AnimationClock layer={layer} onTick={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
