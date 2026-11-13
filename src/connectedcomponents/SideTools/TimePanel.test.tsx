import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { getWMLayerById } from '@opengeoweb/webmap';
import type { WMLayer } from '@opengeoweb/webmap';
import { useAppDispatch, useAppSelector } from '../../store/store';
import { AdagucLayer } from '../../store/types';
import TimePanel from './TimePanel';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
}));

jest.mock('../../store/store', () => ({
  actions: {
    changeLayerDimension: (payload: unknown) => ({
      type: 'wmsservices/changeLayerDimension',
      payload,
    }),
    layerToggleAnimation: (payload: unknown) => ({
      type: 'wmsservices/layerToggleAnimation',
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
const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockUseAppSelector = jest.mocked(useAppSelector);

const mapId = 'map1';

// Mirrors WMJSDimension's own relevant surface. getClosestValue here just
// picks whichever of this dimension's own values is nearest the given
// one (string-compare is enough for the fixed-width ISO strings used
// throughout these tests).
const makeTimeDimension = (values: string[]) => ({
  name: 'time',
  size: () => values.length,
  getIndexForValue: (value: string) => {
    const index = values.indexOf(value);
    return index === -1 ? 0 : index;
  },
  getValueForIndex: (index: number) => values[index],
  getClosestValue: (value: string) => {
    if (values.includes(value)) {
      return value;
    }
    const closest = values.reduce((best, candidate) =>
      Math.abs(Date.parse(candidate) - Date.parse(value)) <
      Math.abs(Date.parse(best) - Date.parse(value))
        ? candidate
        : best,
    );
    return closest;
  },
});

// A long run of hourly ISO values, for tests that need a dimension big
// enough to exercise the "sticky page" behaviour below (the default
// row-fit guess, DEFAULT_ROWS_TO_FIT, is 20 - jsdom has no real layout
// for ResizeObserver to measure against, so that default is what every
// test actually renders against).
const makeHourlySeries = (count: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(2025, 0, 1, i, 0, 0))
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
  );

const buildLayer = (overrides: Partial<AdagucLayer> = {}): AdagucLayer => ({
  id: 'layer-1',
  name: 'air_pressure_msl',
  serviceUrl: 'http://localhost:8080/adagucserver',
  style: 'default',
  dimensions: [{ name: 'time', currentValue: '2025-01-01T01:00:00Z' }],
  enabled: true,
  opacity: 1,
  ...overrides,
});

const selectState = (layers: AdagucLayer[], isAnimating = false): void => {
  mockUseAppSelector.mockImplementation((selector) =>
    selector({
      viewer: {
        maps: {
          [mapId]: {
            layers,
            isAnimating,
            isGetFeatureInfoActive: false,
            isHistogramBoxSelectActive: false,
            view: {
              srs: 'EPSG:3857',
              bbox: { left: -1, bottom: -1, right: 1, top: 1 },
            },
          },
        },
        services: {},
        baseLayers: [],
      },
    }),
  );
};

describe('TimePanel', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    mockDispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockGetWMLayerById.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows an empty state when no enabled layer has a time dimension', () => {
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue(undefined);

    render(<TimePanel mapId={mapId} />);

    expect(
      screen.getByText('No enabled layers have a time dimension.'),
    ).toBeInTheDocument();
  });

  it('ignores a disabled layer entirely', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    const disabledLayer = buildLayer({ enabled: false });
    selectState([disabledLayer]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    expect(
      screen.getByText('No enabled layers have a time dimension.'),
    ).toBeInTheDocument();
  });

  it('shows the current time and a row for every nearby value, clicking a row applies it', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    // The "Local time" header renders in the test runner's own timezone
    // (same as the implementation does) - derived the same way here
    // rather than hardcoded, so this doesn't depend on which timezone
    // happens to be running the tests.
    const expectedLocalTime = new Date('2025-01-01T01:00:00Z')
      .toString()
      .replace(/ GMT.*/, '');
    expect(screen.getByText(expectedLocalTime)).toBeInTheDocument();
    expect(screen.getAllByText('2025-01-01')).toHaveLength(3);
    expect(screen.getByText('00:00z')).toBeInTheDocument();
    expect(screen.getByText('01:00z')).toBeInTheDocument();
    // 02:00z is the latest value in this dimension, so it renders with
    // the trailing "*" marker - see the dedicated latest-timestep test.
    expect(screen.getByText('02:00z*')).toBeInTheDocument();

    fireEvent.click(screen.getByText('00:00z'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/changeLayerDimension',
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T00:00:00Z',
      },
    });
  });

  it('marks the most recent value across all enabled layers as the latest timestep, with a star, in blue, and a tooltip', async () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    expect(screen.queryByText('02:00z')).not.toBeInTheDocument();
    const latestCell = screen.getByText('02:00z*');
    const latestRow = latestCell.closest('tr');
    expect(latestRow).not.toBeNull();
    expect(latestRow).toHaveStyle({ backgroundColor: 'rgb(128, 179, 255)' });

    const earlierRow = screen.getByText('00:00z').closest('tr');
    expect(earlierRow).toHaveStyle({ backgroundColor: 'rgb(170, 255, 170)' });

    fireEvent.mouseOver(latestCell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This is the latest timestep',
    );
  });

  it('steps forward and backward through the nearby values', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    fireEvent.click(screen.getByLabelText('Step forward'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T02:00:00Z',
        }),
      }),
    );

    mockDispatch.mockClear();
    fireEvent.click(screen.getByLabelText('Step back'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T00:00:00Z',
        }),
      }),
    );
  });

  it('keeps the same rows on screen across a single step - only the selected row moves - but pages to a freshly centered list once stepped past the edge', () => {
    // Regression guard: ported from the legacy tool's own generate(),
    // which only rebuilds its rendered row list when the new value isn't
    // one of the rows already on screen, and otherwise just moves which
    // row is marked selected - a naive "recompute a centered window on
    // every step" implementation instead redraws the whole list on every
    // single step, so the selected row visually never appears to move.
    const series = makeHourlySeries(50);
    const dimension = makeTimeDimension(series);
    let layers = [
      buildLayer({
        dimensions: [{ name: 'time', currentValue: series[25] }],
      }),
    ];
    selectState(layers);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { container, rerender } = render(<TimePanel mapId={mapId} />);
    const rowTexts = (): string[] =>
      Array.from(container.querySelectorAll('tbody tr')).map(
        (tr) => tr.textContent ?? '',
      );

    // jsdom has no real layout for ResizeObserver to measure against, so
    // the panel falls back to its default row-fit guess here.
    const initialRows = rowTexts();
    expect(initialRows.length).toBe(20);

    const stepForwardOnce = (): void => {
      mockDispatch.mockClear();
      fireEvent.click(screen.getByLabelText('Step forward'));
      const [action] = mockDispatch.mock.calls[0] as [
        { payload: { dimensionValue: string } },
      ];
      layers = [
        buildLayer({
          dimensions: [
            { name: 'time', currentValue: action.payload.dimensionValue },
          ],
        }),
      ];
      selectState(layers);
      rerender(<TimePanel mapId={mapId} />);
    };

    stepForwardOnce();
    expect(rowTexts()).toEqual(initialRows);

    // Keep stepping until well past the originally-shown page's own edge.
    for (let i = 0; i < 14; i += 1) {
      stepForwardOnce();
    }
    expect(rowTexts()).not.toEqual(initialRows);
  });

  it('steps forward and backward on mouse wheel over the list, matching the step buttons', () => {
    // Regression guard: the legacy tool's own list supported this via
    // addMouseWheelEvent - scrolling down steps forward, scrolling up
    // steps backward, one value at a time.
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { container } = render(<TimePanel mapId={mapId} />);
    const list = container.querySelector('table');
    if (!list) {
      throw new Error('TimePanel rendered no table');
    }

    fireEvent.wheel(list, { deltaY: 100 });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T02:00:00Z',
        }),
      }),
    );

    mockDispatch.mockClear();
    fireEvent.wheel(list, { deltaY: -100 });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T00:00:00Z',
        }),
      }),
    );
  });

  it('jumps to the earliest/latest nearby value', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    fireEvent.click(screen.getByLabelText('Jump to latest shown'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T02:00:00Z',
        }),
      }),
    );

    mockDispatch.mockClear();
    fireEvent.click(screen.getByLabelText('Jump to earliest shown'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          dimensionValue: '2025-01-01T00:00:00Z',
        }),
      }),
    );
  });

  it('applies a picked value to every enabled, time-aware layer, each snapped to its own closest value', () => {
    // Regression guard: this is what sets TimePanel apart from the
    // per-layer "link" checkbox - it always drives every enabled layer,
    // not just an opted-in subset, and each one is snapped independently
    // rather than forced to the exact same string.
    const coarseDimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    const fineDimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    const layerA = buildLayer({
      id: 'layer-a',
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
    });
    const layerB = buildLayer({
      id: 'layer-b',
      name: 'air_temperature',
      dimensions: [{ name: 'time', currentValue: '2025-01-01T00:00:00Z' }],
    });
    selectState([layerA, layerB]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetWMLayerById.mockImplementation((id: string): any => ({
      getDimension: (name: string) => {
        if (name !== 'time') {
          return undefined;
        }
        return id === 'layer-a' ? coarseDimension : fineDimension;
      },
    }));

    render(<TimePanel mapId={mapId} />);

    fireEvent.click(screen.getByLabelText('Jump to latest shown'));

    // layerA's coarse dimension has no 01:00 step, so its own closest
    // value for whatever gets picked is still one of its own two values.
    const dispatchedValues: string[] = mockDispatch.mock.calls.map(
      ([action]: [{ payload: { dimensionValue: string } }]) =>
        action.payload.dimensionValue,
    );
    expect(dispatchedValues).toContain('2025-01-01T02:00:00Z');
    expect(
      dispatchedValues.every(
        (value: string) =>
          ['2025-01-01T00:00:00Z', '2025-01-01T02:00:00Z'].includes(value) ||
          value === '2025-01-01T01:00:00Z',
      ),
    ).toBe(true);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it('toggles map-wide play/stop, driven by the reference layer', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    expect(
      screen.getByRole('button', { name: 'Play animation' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play animation' }));

    // The TIME panel's Play animates every layer, not just the reference
    // layer's own linked group (which a layer card's Play does).
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/layerToggleAnimation',
      payload: { mapId, layerIndex: 0, scope: 'all' },
    });
  });

  it('shows Stop while the map is animating', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
    ]);
    selectState([buildLayer()], true);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('composes the 5 date/time fields into a value and applies it on blur', () => {
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    fireEvent.change(screen.getByLabelText('Hour'), {
      target: { value: '2' },
    });
    fireEvent.blur(screen.getByLabelText('Hour'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/changeLayerDimension',
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T02:00:00Z',
      },
    });
  });

  it("applies a field's up/down step button immediately, without needing blur or Enter", () => {
    // Regression guard: the browser's native number-input spinner only
    // updates the field's own displayed value - these are this
    // component's own step buttons instead, specifically so clicking one
    // applies the change right away.
    const dimension = makeTimeDimension([
      '2025-01-01T00:00:00Z',
      '2025-01-01T01:00:00Z',
      '2025-01-01T02:00:00Z',
    ]);
    selectState([buildLayer()]);
    mockGetWMLayerById.mockReturnValue({
      getDimension: (name: string) => (name === 'time' ? dimension : undefined),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    render(<TimePanel mapId={mapId} />);

    fireEvent.click(screen.getByLabelText('Increase Hour'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/changeLayerDimension',
      payload: {
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T02:00:00Z',
      },
    });
  });
});
