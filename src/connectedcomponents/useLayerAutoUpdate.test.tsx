import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { getWMLayerById, queryWMSLayer } from '@opengeoweb/webmap';
import { actions, createAppStore, useAppSelector } from '../store/store';
import { ViewerState } from '../store/types';
import { emptyMap } from '../testUtils/renderWithStore';
import {
  AUTO_UPDATE_INTERVAL_MS,
  useLayerAutoUpdate,
} from './useLayerAutoUpdate';

vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: vi.fn(),
  queryWMSLayer: vi.fn(),
}));

const mapId = 'map1';

// The layer's time values as its server lists them, and the default time
// its capabilities currently advertise - a test changes that to stand in
// for new data arriving.
let times: string[];
let advertisedDefault: string;
// The WMLayer's own time dimension. Like the real one after a re-parse, it
// keeps the default it was first given until something replaces it.
const timeDimension = {
  size: () => times.length,
  getValueForIndex: (index: number) => times[index],
  getClosestValue: vi.fn(() => '2026-11-16T07:05:00Z'),
  defaultValue: '',
};
const parseLayer = vi.fn();
const fakeWMLayer = {
  name: 'RAD_NL25_PCP_CM',
  service: 'https://example.com/wms?',
  getDimension: (name: string) => (name === 'time' ? timeDimension : undefined),
  parseLayer,
};

// Runs the hook for the store's one layer, the way ReduxLayerComponent does,
// and shows what it returns: when its current check started.
const AutoUpdatingLayer = ({
  isAnimating,
}: {
  isAnimating: boolean;
}): React.ReactElement => {
  const layer = useAppSelector(
    (state: ViewerState) => state.viewer.maps[mapId].layers[0],
  );
  const startedAt = useLayerAutoUpdate({
    mapId,
    layerIndex: 0,
    layer,
    isAnimating,
  });
  return <div data-testid="check-started-at">{startedAt ?? ''}</div>;
};
const checkStartedAt = (): number | undefined => {
  const text = screen.getByTestId('check-started-at').textContent;
  return text ? Number(text) : undefined;
};

const setup = (autoUpdate: boolean) => {
  const store = createAppStore({
    viewer: {
      services: {},
      baseLayers: [],
      maps: {
        [mapId]: emptyMap({
          layers: [
            {
              id: 'radar',
              name: 'RAD_NL25_PCP_CM',
              serviceUrl: 'https://example.com/wms?',
              style: '',
              enabled: true,
              opacity: 1,
              autoUpdate,
              dimensions: [
                { name: 'time', currentValue: '2026-11-16T07:00:00Z' },
              ],
            },
          ],
        }),
      },
    },
  });
  const { rerender } = render(
    <Provider store={store}>
      <AutoUpdatingLayer isAnimating={false} />
    </Provider>,
  );
  const setAnimating = (isAnimating: boolean): void => {
    rerender(
      <Provider store={store}>
        <AutoUpdatingLayer isAnimating={isAnimating} />
      </Provider>,
    );
  };
  const layer = () => store.getState().viewer.maps[mapId].layers[0];
  const time = () => layer().dimensions[0].currentValue;
  return { store, setAnimating, layer, time };
};

// Lets parseLayer resolve and the jump after it happen.
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
const nextCheck = () =>
  act(() => vi.advanceTimersByTimeAsync(AUTO_UPDATE_INTERVAL_MS));

describe('useLayerAutoUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A later time than the default, as with a forecast's future steps.
    times = [
      '2026-11-16T07:00:00Z',
      '2026-11-16T07:05:00Z',
      '2026-11-16T07:10:00Z',
    ];
    advertisedDefault = '2026-11-16T07:05:00Z';
    // What the layer was first added with.
    timeDimension.defaultValue = '2026-11-16T07:00:00Z';
    vi.mocked(queryWMSLayer).mockImplementation(() =>
      Promise.resolve({
        name: 'RAD_NL25_PCP_CM',
        dimensions: [{ name: 'time', currentValue: advertisedDefault }],
      } as unknown as Awaited<ReturnType<typeof queryWMSLayer>>),
    );
    parseLayer.mockReset().mockResolvedValue(fakeWMLayer);
    vi.mocked(getWMLayerById).mockReturnValue(
      fakeWMLayer as unknown as ReturnType<typeof getWMLayerById>,
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads the capabilities and jumps to the default time they advertise (not simply the last one), and then keeps following it', async () => {
    const { time, layer } = setup(true);
    await settle();

    expect(parseLayer).toHaveBeenCalledWith(true);
    // The freshly advertised default, read from the capabilities just
    // fetched - not the one the WMLayer was first added with.
    expect(queryWMSLayer).toHaveBeenCalledWith(
      'https://example.com/wms?',
      'RAD_NL25_PCP_CM',
      true,
    );
    expect(time()).toBe('2026-11-16T07:05:00Z');
    expect(layer().autoUpdate).toBe(true);

    advertisedDefault = '2026-11-16T07:10:00Z';
    await nextCheck();

    expect(time()).toBe('2026-11-16T07:10:00Z');
  });

  it("takes an advertised 'current' as the time closest to now", async () => {
    advertisedDefault = 'current';
    const { time } = setup(true);
    await settle();

    expect(timeDimension.getClosestValue).toHaveBeenCalled();
    expect(time()).toBe('2026-11-16T07:05:00Z');
  });

  it('uses the last time for a layer that advertises no default', async () => {
    advertisedDefault = '';
    timeDimension.defaultValue = '';
    const { time } = setup(true);
    await settle();

    expect(time()).toBe('2026-11-16T07:10:00Z');
  });

  it('tells when each check started, for the countdown to the next one', async () => {
    const { store } = setup(true);
    await settle();
    const first = checkStartedAt();
    expect(first).toBe(Date.now());

    await nextCheck();
    expect(checkStartedAt()).toBe((first ?? 0) + AUTO_UPDATE_INTERVAL_MS);

    act(() => {
      store.dispatch(
        actions.setLayerAutoUpdate({ mapId, layerIndex: 0, autoUpdate: false }),
      );
    });
    expect(checkStartedAt()).toBeUndefined();
  });

  it('does nothing while off', async () => {
    const { time } = setup(false);
    await settle();
    await nextCheck();

    expect(parseLayer).not.toHaveBeenCalled();
    expect(time()).toBe('2026-11-16T07:00:00Z');
  });

  it('leaves an animation alone, and goes back to the default time once it stops', async () => {
    const { store, time, setAnimating } = setup(false);
    setAnimating(true);
    // Switched on while the layer animates.
    act(() => {
      store.dispatch(
        actions.setLayerAutoUpdate({ mapId, layerIndex: 0, autoUpdate: true }),
      );
    });
    await settle();
    expect(parseLayer).toHaveBeenCalledWith(true);
    expect(time()).toBe('2026-11-16T07:00:00Z');

    setAnimating(false);
    await settle();
    expect(time()).toBe('2026-11-16T07:05:00Z');
  });

  it('stops once the time is picked by hand', async () => {
    const { store, time, layer } = setup(true);
    await settle();

    act(() => {
      store.dispatch(
        actions.changeLayerDimension({
          mapId,
          layerIndex: 0,
          dimensionName: 'time',
          dimensionValue: '2026-11-16T07:00:00Z',
        }),
      );
    });
    advertisedDefault = '2026-11-16T07:10:00Z';
    await nextCheck();

    expect(layer().autoUpdate).toBeUndefined();
    expect(time()).toBe('2026-11-16T07:00:00Z');
  });
});
