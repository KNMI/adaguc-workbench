import { actions } from '../store/store';
import { thunks } from '../store/thunks';
import { AdagucMap } from '../store/types';
import {
  handleWindowLocationQueryString,
  makePermaLink,
} from './handleWindowLocationQueryString';

jest.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: jest.fn(),
  LayerType: { baseLayer: 'baseLayer', overLayer: 'overLayer' },
}));

const mapId = 'map1';

const setUrl = (search: string): void => {
  window.history.pushState({}, '', `http://localhost/${search}`);
};

describe('handleWindowLocationQueryString', () => {
  afterEach(() => {
    window.history.pushState({}, '', 'http://localhost/');
  });

  it('dispatches a plain, serializable bbox object rather than a WMBBOX instance', () => {
    setUrl('?srs=EPSG%3A3857&bbox=-1,-2,3,4');
    const dispatch = jest.fn();

    handleWindowLocationQueryString(mapId, dispatch);

    const expectedAction = actions.requestSetProjection({
      mapId,
      srs: 'EPSG:3857',
      bbox: { left: -1, bottom: -2, right: 3, top: 4 },
    });
    expect(dispatch).toHaveBeenCalledWith(expectedAction);

    // Regression guard: a WMBBOX instance has its own bound methods, which
    // the Redux DevTools extension can't structured-clone to relay the
    // action - that clone failure stops the dispatch dead, so nothing
    // after it (e.g. adding layers from the same permalink) ever runs.
    const [dispatchedAction] = dispatch.mock.calls.find(
      ([action]) => action.type === expectedAction.type,
    );
    expect(Object.getPrototypeOf(dispatchedAction.payload.bbox)).toBe(
      Object.prototype,
    );
  });

  it('does not dispatch requestSetProjection for a malformed bbox', () => {
    setUrl('?srs=EPSG%3A3857&bbox=not,a,valid,bbox');
    const dispatch = jest.fn();

    handleWindowLocationQueryString(mapId, dispatch);

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wmsservices/requestSetProjection' }),
    );
  });

  it('still adds the valid layers from the url when one layer entry is malformed', async () => {
    // Regression guard: a malformed entry used to reach addLayers as null,
    // which threw on it - and since that happened inside its promise, none
    // of the layers after it were added and the url's dims were never
    // applied either.
    setUrl(
      '?service=https%3A%2F%2Fexample.com%2Fwms%3F' +
        '&layer=broken$entry,Reflectivity$image%2Fpng$true$$1$0' +
        '&dims=time$2025-01-01T00:00:00Z',
    );
    const addLayer = jest
      .spyOn(thunks, 'addLayer')
      .mockImplementation(
        (args) => args as unknown as ReturnType<typeof thunks.addLayer>,
      );
    const dispatch = jest.fn(() => ({ unwrap: () => Promise.resolve() }));

    handleWindowLocationQueryString(mapId, dispatch as never);
    // Let addLayers' awaits and the dims follow-up run.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(addLayer).toHaveBeenCalledTimes(1);
    expect(addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Reflectivity',
        serviceUrl: 'https://example.com/wms?',
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      actions.changeLayerDimension({
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2025-01-01T00:00:00Z',
      }),
    );
    addLayer.mockRestore();
  });

  it('does not dispatch requestSetProjection when srs or bbox is missing', () => {
    setUrl('?bbox=-1,-2,3,4');
    const dispatch = jest.fn();

    handleWindowLocationQueryString(mapId, dispatch);

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wmsservices/requestSetProjection' }),
    );
  });
});

describe('makePermaLink', () => {
  afterEach(() => {
    window.history.pushState({}, '', 'http://localhost/');
  });

  it('includes the path the app is served under, not just the origin', () => {
    // Regression guard: this app is also deployed as a GitHub Pages
    // *project* site (e.g. https://knmi.github.io/adaguc-workbench/) -
    // using window.location.origin alone dropped that path, producing a
    // permalink that pointed at the bare domain root instead.
    window.history.pushState(
      {},
      '',
      'http://localhost/adaguc-workbench/?autowms=https://example.com/autowms',
    );
    const map: AdagucMap = {
      isAnimating: false,
      isGetFeatureInfoActive: false,
      isHistogramBoxSelectActive: false,
      layers: [],
      view: {
        srs: 'EPSG:3857',
        bbox: { left: -1, bottom: -2, right: 3, top: 4 },
      },
    };

    const link = makePermaLink(map);

    expect(link.startsWith('http://localhost/adaguc-workbench/?')).toBe(true);
  });
});
