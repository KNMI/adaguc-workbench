import { actions } from '../store/store';
import { thunks } from '../store/thunks';
import { DEFAULT_BASE_LAYERS } from '../utils/baseLayerPresets';
import { AdagucMap } from '../store/types';
import {
  handleWindowLocationQueryString,
  makePermaLink,
} from './handleWindowLocationQueryString';

vi.mock('@opengeoweb/webmap', () => ({
  getWMLayerById: vi.fn(),
  LayerType: { baseLayer: 'baseLayer', overLayer: 'overLayer' },
}));

const mapId = 'map1';

const setUrl = (search: string): void => {
  window.history.pushState({}, '', `http://localhost/${search}`);
};

// Runs the permalink parser against the current url - with adding layers
// stubbed out, as that's not what these tests are about - and returns the
// plain actions it dispatched once those layers are "added".
const dispatchedActionsFor = async (): Promise<
  Array<{ type: string; payload: unknown }>
> => {
  const addLayer = vi
    .spyOn(thunks, 'addLayer')
    .mockImplementation(
      (args) => args as unknown as ReturnType<typeof thunks.addLayer>,
    );
  const dispatch = vi.fn((action: unknown) =>
    typeof action === 'object' && action && 'type' in action
      ? action
      : { unwrap: () => Promise.resolve() },
  );
  handleWindowLocationQueryString(mapId, dispatch as never);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  addLayer.mockRestore();
  return dispatch.mock.calls
    .map(([action]) => action as { type?: string; payload: unknown })
    .filter((action): action is { type: string; payload: unknown } =>
      Boolean(action?.type),
    );
};

const TWO_LAYERS =
  '?service=https%3A%2F%2Fexample.com%2Fwms%3F' +
  '&layer=a$image%2Fpng$true$$1$0,b$image%2Fpng$true$$1$0';

describe('handleWindowLocationQueryString', () => {
  afterEach(() => {
    window.history.pushState({}, '', 'http://localhost/');
  });

  it('dispatches a plain, serializable bbox object rather than a WMBBOX instance', () => {
    setUrl('?srs=EPSG%3A3857&bbox=-1,-2,3,4');
    const dispatch = vi.fn();

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
    const dispatchedAction = dispatch.mock.calls.find(
      ([action]) => action.type === expectedAction.type,
    )?.[0];
    expect(Object.getPrototypeOf(dispatchedAction.payload.bbox)).toBe(
      Object.prototype,
    );
  });

  it('does not dispatch requestSetProjection for a malformed bbox', () => {
    setUrl('?srs=EPSG%3A3857&bbox=not,a,valid,bbox');
    const dispatch = vi.fn();

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
    const addLayer = vi
      .spyOn(thunks, 'addLayer')
      .mockImplementation(
        (args) => args as unknown as ReturnType<typeof thunks.addLayer>,
      );
    const dispatch = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

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

  it("restores every layer's own values and link checkboxes, and a running animation, from layerdims/animate", async () => {
    setUrl(
      `${TWO_LAYERS}&dims=time$1999-01-01T00:00:00Z` +
        '&layerdims=0$time$2026-11-13T12:10:00Z$1,1$time$2026-11-13T12:00:00Z$1' +
        '&animate=1$group',
    );

    const dispatched = await dispatchedActionsFor();

    expect(dispatched).toEqual([
      actions.changeLayerDimension({
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2026-11-13T12:10:00Z',
      }),
      actions.changeLayerDimension({
        mapId,
        layerIndex: 1,
        dimensionName: 'time',
        dimensionValue: '2026-11-13T12:00:00Z',
      }),
      actions.setLayerDimensionLinked({
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        linked: true,
      }),
      actions.setLayerDimensionLinked({
        mapId,
        layerIndex: 1,
        dimensionName: 'time',
        linked: true,
      }),
      actions.layerToggleAnimation({ mapId, layerIndex: 1, scope: 'group' }),
    ]);
  });

  it('switches on exactly the base maps/overlays a permalink lists', async () => {
    setUrl(
      `${TWO_LAYERS}&baselayers=baselayer-worldmap,overlay-countryborders`,
    );

    const dispatched = await dispatchedActionsFor();

    expect(dispatched).toContainEqual(
      actions.setEnabledBaseLayers({
        ids: ['baselayer-worldmap', 'overlay-countryborders'],
      }),
    );
  });

  it('collapses the side panels a permalink lists, and none without it', async () => {
    setUrl(`${TWO_LAYERS}&collapsed=layers,tools`);
    const collapsed = await dispatchedActionsFor();

    expect(collapsed).toContainEqual(
      actions.setPanelExpanded({ panel: 'layers', expanded: false }),
    );
    expect(collapsed).toContainEqual(
      actions.setPanelExpanded({ panel: 'tools', expanded: false }),
    );

    setUrl(TWO_LAYERS);
    const defaults = await dispatchedActionsFor();

    expect(defaults.map((action) => action.type)).not.toContain(
      actions.setPanelExpanded({ panel: 'layers', expanded: false }).type,
    );
  });

  it('keeps the default base maps for a permalink without baselayers', async () => {
    setUrl(TWO_LAYERS);

    const dispatched = await dispatchedActionsFor();

    expect(dispatched.map((action) => action.type)).not.toContain(
      actions.setEnabledBaseLayers({ ids: [] }).type,
    );
  });

  it("still applies an older permalink's dims to the first layer", async () => {
    setUrl(`${TWO_LAYERS}&dims=time$2026-11-13T12:10:00Z`);

    const dispatched = await dispatchedActionsFor();

    expect(dispatched).toEqual([
      actions.changeLayerDimension({
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2026-11-13T12:10:00Z',
      }),
    ]);
  });

  it('applies layerdims/animate to the right layers when a malformed layer entry is skipped', async () => {
    setUrl(
      '?service=https%3A%2F%2Fexample.com%2Fwms%3F' +
        '&layer=broken$entry,b$image%2Fpng$true$$1$0' +
        '&layerdims=1$time$2026-11-13T12:00:00Z$0&animate=1$all',
    );

    const dispatched = await dispatchedActionsFor();

    // Entry 1 in the url is the first (and only) layer actually added.
    expect(dispatched).toEqual([
      actions.changeLayerDimension({
        mapId,
        layerIndex: 0,
        dimensionName: 'time',
        dimensionValue: '2026-11-13T12:00:00Z',
      }),
      actions.layerToggleAnimation({ mapId, layerIndex: 0, scope: 'all' }),
    ]);
  });

  it('does not dispatch requestSetProjection when srs or bbox is missing', () => {
    setUrl('?bbox=-1,-2,3,4');
    const dispatch = vi.fn();

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

  it("writes every layer's own values, link checkboxes and a running animation, keeping dims (the first layer's values) for older versions", () => {
    const layer = (id: string, time: string, linked: boolean) => ({
      id,
      name: id,
      serviceUrl: 'https://example.com/wms?',
      style: '',
      enabled: true,
      opacity: 1,
      dimensions: [{ name: 'time', currentValue: time, linked }],
    });
    const map: AdagucMap = {
      isAnimating: true,
      animation: { layerId: 'b', scope: 'group' },
      isGetFeatureInfoActive: false,
      isHistogramBoxSelectActive: false,
      layers: [
        layer('a', '2026-11-13T12:10:00Z', true),
        layer('b', '2026-11-13T12:00:00Z', false),
      ],
      view: {
        srs: 'EPSG:3857',
        bbox: { left: -1, bottom: -2, right: 3, top: 4 },
      },
    };

    const params = new URL(makePermaLink(map)).searchParams;

    expect(params.get('dims')).toBe('time$2026-11-13T12:10:00Z');
    expect(params.get('layerdims')).toBe(
      '0$time$2026-11-13T12:10:00Z$1,1$time$2026-11-13T12:00:00Z$0',
    );
    expect(params.get('animate')).toBe('1$group');
    // No base layers given - left out.
    expect(params.has('baselayers')).toBe(false);
    // The original six-field layer entries are unchanged, so older versions
    // still restore every layer from a new link.
    expect(params.get('layer')?.split(',')).toEqual([
      'a$$true$$1$0',
      'b$$true$$1$0',
    ]);
  });

  it('lists the switched-on base maps and overlays in baselayers', () => {
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

    const params = new URL(makePermaLink(map, DEFAULT_BASE_LAYERS))
      .searchParams;

    expect(params.get('baselayers')).toBe(
      'baselayer-worldmap-light-grey-canvas,overlay-countryborders',
    );
  });

  it('writes collapsed only while a side panel is collapsed', () => {
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
    const collapsedParam = (layers: boolean, tools: boolean) =>
      new URL(makePermaLink(map, [], { layers, tools })).searchParams.get(
        'collapsed',
      );

    expect(collapsedParam(false, true)).toBe('layers');
    expect(collapsedParam(true, false)).toBe('tools');
    expect(collapsedParam(true, true)).toBeNull();
  });
});
