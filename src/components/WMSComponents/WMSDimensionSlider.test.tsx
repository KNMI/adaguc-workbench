import type { MockedFunction } from 'vitest';
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import WMSDimensionSlider from './WMSDimensionSlider';

vi.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: vi.fn(),
}));

// opengeoweb types this as always returning a WMLayer, but it returns
// undefined for an unknown id - which these tests stub too.
const mockGetWMLayerById = vi.mocked(getWMLayerById) as MockedFunction<
  (layerId: string) => WMLayer | undefined
>;

const layerId = 'layer-1';

// A long run of hourly ISO values - big enough that this stands in for a
// "timevalues"-typed dimension the way RADAR's real, ~200,000-entry one
// is, without actually needing that many entries for a test to exercise
// the behaviour that matters: how often getIndexForValue gets called.
const values = Array.from({ length: 50 }, (_, i) =>
  new Date(Date.UTC(2025, 0, 1, i, 0, 0)).toISOString(),
);

const makeDimension = () => ({
  name: 'time',
  units: 'ISO8601',
  size: vi.fn(() => values.length),
  getValueForIndex: vi.fn((index: number) => values[index]),
  getIndexForValue: vi.fn((value: string) => values.indexOf(value)),
});

const renderSlider = (dimension: ReturnType<typeof makeDimension>) => {
  mockGetWMLayerById.mockReturnValue({
    getDimension: (name: string) => (name === 'time' ? dimension : undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const onSelectDimensionValue = vi.fn();
  const utils = render(
    <WMSDimensionSlider
      selectedDimensionValue={values[10]}
      layerId={layerId}
      onSelectDimensionValue={onSelectDimensionValue}
      dimensionName="time"
      linked={false}
      onToggleLinked={vi.fn()}
    />,
  );
  return { ...utils, onSelectDimensionValue };
};

describe('WMSDimensionSlider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps the slider at the last valid index (size() - 1), not size() itself', () => {
    const dimension = makeDimension();
    renderSlider(dimension);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemax', String(values.length - 1));
  });

  it('debounces rapid drag updates into a single committed value', () => {
    vi.useFakeTimers();
    try {
      const dimension = makeDimension();
      const { onSelectDimensionValue } = renderSlider(dimension);
      const slider = screen.getByRole('slider');

      // Simulates several rapid drag ticks, as MUI's Slider onChange fires
      // continuously while dragging - well within the debounce window of
      // each other. The very first tick fires immediately (the debounce
      // is leading+trailing, so dragging starts reacting right away
      // rather than only once it stops) - it's specifically the ticks in
      // between the first and the last that get collapsed away.
      act(() => {
        fireEvent.change(slider, { target: { value: '20' } });
      });
      expect(onSelectDimensionValue).toHaveBeenCalledWith(values[20]);
      onSelectDimensionValue.mockClear();

      act(() => {
        vi.advanceTimersByTime(10);
        fireEvent.change(slider, { target: { value: '22' } });
      });
      act(() => {
        vi.advanceTimersByTime(10);
        fireEvent.change(slider, { target: { value: '25' } });
      });

      // Still within the debounce window of the last tick above.
      expect(onSelectDimensionValue).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Only the final value of the burst - the one in between (22) never
      // reached onSelectDimensionValue on its own.
      expect(onSelectDimensionValue).toHaveBeenCalledTimes(1);
      expect(onSelectDimensionValue).toHaveBeenCalledWith(values[25]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-derive the index via getIndexForValue when selectedDimensionValue is just its own last commit echoing back', () => {
    // Regression guard: getIndexForValue does a full scan over every one
    // of the dimension's own values (see WMJSDimension's "timevalues"
    // handling) - with RADAR's real ~200,000-entry dimension, calling it
    // on every single debounced commit during a drag is what made the
    // slider feel sluggish. It should only be needed for a genuinely
    // external change, not to re-confirm what this slider just set
    // itself.
    vi.useFakeTimers();
    try {
      const dimension = makeDimension();
      const { rerender } = renderSlider(dimension);
      const slider = screen.getByRole('slider');

      // The initial mount's own sync effect looks the starting value up
      // once - expected and fine.
      expect(dimension.getIndexForValue).toHaveBeenCalledTimes(1);
      dimension.getIndexForValue.mockClear();

      act(() => {
        fireEvent.change(slider, { target: { value: '30' } });
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // The commit itself never needed getIndexForValue (only
      // getValueForIndex, a plain array index).
      expect(dimension.getIndexForValue).not.toHaveBeenCalled();

      // Redux round-tripping that same committed value back down as the
      // next selectedDimensionValue prop - the echo this test guards.
      rerender(
        <WMSDimensionSlider
          selectedDimensionValue={values[30]}
          layerId={layerId}
          onSelectDimensionValue={vi.fn()}
          dimensionName="time"
          linked={false}
          onToggleLinked={vi.fn()}
        />,
      );

      expect(dimension.getIndexForValue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does look the index up for a genuinely external change (e.g. a linked layer, or the TIME panel)', () => {
    const dimension = makeDimension();
    const { rerender } = renderSlider(dimension);
    dimension.getIndexForValue.mockClear();

    rerender(
      <WMSDimensionSlider
        selectedDimensionValue={values[40]}
        layerId={layerId}
        onSelectDimensionValue={vi.fn()}
        dimensionName="time"
        linked={false}
        onToggleLinked={vi.fn()}
      />,
    );

    expect(dimension.getIndexForValue).toHaveBeenCalledWith(values[40]);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '40');
  });

  it('cancels a pending debounced commit if the slider unmounts mid-drag', () => {
    vi.useFakeTimers();
    try {
      const dimension = makeDimension();
      const { onSelectDimensionValue, unmount } = renderSlider(dimension);
      const slider = screen.getByRole('slider');

      // The first tick commits immediately (the debounce's leading edge) -
      // expected, and not what this test is guarding.
      act(() => {
        fireEvent.change(slider, { target: { value: '15' } });
      });
      expect(onSelectDimensionValue).toHaveBeenCalledWith(values[15]);
      onSelectDimensionValue.mockClear();

      // A second tick, still mid-drag, is what's left pending (the
      // trailing edge) when the slider unmounts right after it.
      act(() => {
        fireEvent.change(slider, { target: { value: '18' } });
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onSelectDimensionValue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing, without crashing, when its dimension goes away after having been shown', () => {
    // All hooks now run before the "no layer / no dimension" early returns,
    // so a render without the dimension (e.g. mid capabilities refresh)
    // must still call every one of them before bailing out.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderSlider(makeDimension());
    expect(screen.getByRole('slider')).toBeInTheDocument();

    mockGetWMLayerById.mockReturnValue({
      getDimension: () => undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    rerender(
      <WMSDimensionSlider
        selectedDimensionValue={values[10]}
        layerId={layerId}
        onSelectDimensionValue={vi.fn()}
        dimensionName="time"
        linked={false}
        onToggleLinked={vi.fn()}
      />,
    );

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('syncs to the selected value once its layer becomes available after first rendering nothing', () => {
    // With the hooks running before the layer exists, the effect that
    // looks up the index has to re-run once layerDim shows up - even though
    // selectedDimensionValue itself hasn't changed in the meantime.
    mockGetWMLayerById.mockReturnValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A fresh element each time - re-rendering the very same element object
    // would let React skip the render entirely.
    const slider = () => (
      <WMSDimensionSlider
        selectedDimensionValue={values[10]}
        layerId={layerId}
        onSelectDimensionValue={vi.fn()}
        dimensionName="time"
        linked={false}
        onToggleLinked={vi.fn()}
      />
    );
    const { rerender } = render(slider());
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    const dimension = makeDimension();
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    rerender(slider());

    // Not stuck on its initial index of 0.
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '10');
    warn.mockRestore();
  });

  it('commits through the latest onSelectDimensionValue, not the one it was first rendered with', () => {
    // The debounced commit is created only once, so it must not close over
    // the first render's onSelectDimensionValue: the parent's version of
    // that callback updates the store by the layer's *position* in the
    // list. Today LayerComponent happens to remount this slider whenever
    // its layer moves (layerIndex is part of the row's key), which hides
    // the problem - this keeps it from resurfacing if that key changes.
    vi.useFakeTimers();
    try {
      const dimension = makeDimension();
      const { rerender, onSelectDimensionValue: firstCallback } =
        renderSlider(dimension);
      const latestCallback = vi.fn();
      rerender(
        <WMSDimensionSlider
          selectedDimensionValue={values[10]}
          layerId={layerId}
          onSelectDimensionValue={latestCallback}
          dimensionName="time"
          linked={false}
          onToggleLinked={vi.fn()}
        />,
      );

      act(() => {
        fireEvent.change(screen.getByRole('slider'), {
          target: { value: '20' },
        });
      });

      expect(latestCallback).toHaveBeenCalledWith(values[20]);
      expect(firstCallback).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
