import * as React from 'react';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { getWMLayerById } from '@opengeoweb/webmap';
import { actions, createAppStore, useAppSelector } from '../store/store';
import { ViewerState } from '../store/types';
import { emptyMap } from '../testUtils/renderWithStore';
import { useReferenceTimeSteps } from './useReferenceTimeSteps';

vi.mock('@opengeoweb/webmap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opengeoweb/webmap')>()),
  getWMLayerById: vi.fn(),
}));

const mapId = 'map1';
const hour = (h: number): string =>
  `2026-11-17T${String(h).padStart(2, '0')}:00:00Z`;

// A model's runs: each covers its reference time and the two hours after.
const stepsOfRun = (referenceTime: string): string[] => {
  const start = Number(referenceTime.slice(11, 13));
  return [hour(start), hour(start + 1), hour(start + 2)];
};

// The WMLayer, its time steps those of whichever run it was last given.
let timeSteps: string[];
const timeDimension = {
  getClosestValue: (value: string) =>
    timeSteps.reduce((best, step) =>
      Math.abs(Date.parse(step) - Date.parse(value)) <
      Math.abs(Date.parse(best) - Date.parse(value))
        ? step
        : best,
    ),
};
const referenceTimeDimension = { setValue: vi.fn() };
const handleReferenceTime = vi.fn((_name: string, value: string) => {
  timeSteps = stepsOfRun(value);
});
const fakeWMLayer = {
  getDimension: (name: string) =>
    name === 'time'
      ? timeDimension
      : name === 'reference_time'
        ? referenceTimeDimension
        : undefined,
  handleReferenceTime,
};

// Runs the hook for the store's one layer, the way ReduxLayerComponent does.
const LayerWithRuns = (): null => {
  const layer = useAppSelector(
    (state: ViewerState) => state.viewer.maps[mapId].layers[0],
  );
  useReferenceTimeSteps({ mapId, layerIndex: 0, layer });
  return null;
};

const setup = () => {
  const store = createAppStore({
    viewer: {
      services: {},
      baseLayers: [],
      maps: {
        [mapId]: emptyMap({
          layers: [
            {
              id: 'model',
              name: 'air_temperature',
              serviceUrl: 'https://example.com/wms?',
              style: '',
              enabled: true,
              opacity: 1,
              isReady: true,
              autoUpdate: true,
              dimensions: [
                { name: 'time', currentValue: hour(10) },
                { name: 'reference_time', currentValue: hour(9) },
              ],
            },
          ],
        }),
      },
    },
  });
  render(
    <Provider store={store}>
      <LayerWithRuns />
    </Provider>,
  );
  const layer = () => store.getState().viewer.maps[mapId].layers[0];
  const time = () =>
    layer().dimensions.find((dimension) => dimension.name === 'time')
      ?.currentValue;
  return { store, layer, time };
};

describe('useReferenceTimeSteps', () => {
  beforeEach(() => {
    // As first read, before the layer's own run is applied.
    timeSteps = [hour(0), hour(12)];
    handleReferenceTime.mockClear();
    referenceTimeDimension.setValue.mockClear();
    vi.mocked(getWMLayerById).mockReturnValue(
      fakeWMLayer as unknown as ReturnType<typeof getWMLayerById>,
    );
  });

  it("sets the time steps to the layer's own run, keeping a time that run has", () => {
    const { layer, time } = setup();

    expect(handleReferenceTime).toHaveBeenCalledWith('reference_time', hour(9));
    expect(referenceTimeDimension.setValue).toHaveBeenCalledWith(hour(9));
    expect(timeSteps).toEqual([hour(9), hour(10), hour(11)]);
    expect(time()).toBe(hour(10));
    expect(layer().timeStepsFor).toBe(hour(9));
  });

  it("sets them anew for another run, moving the time to that run's nearest step", () => {
    const { store, layer, time } = setup();

    act(() => {
      store.dispatch(
        actions.changeLayerDimension({
          mapId,
          layerIndex: 0,
          dimensionName: 'reference_time',
          dimensionValue: hour(6),
        }),
      );
    });

    expect(handleReferenceTime).toHaveBeenLastCalledWith(
      'reference_time',
      hour(6),
    );
    expect(timeSteps).toEqual([hour(6), hour(7), hour(8)]);
    expect(time()).toBe(hour(8));
    expect(layer().timeStepsFor).toBe(hour(6));
    // Not a time picked by hand.
    expect(layer().autoUpdate).toBe(true);
  });
});
