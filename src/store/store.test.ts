import { createAppStore } from './store';
import { thunks } from './thunks';

const mapId = 'map1';
const request = (name: string) => ({
  mapId,
  name,
  serviceUrl: 'https://example.com/wms?',
});

describe('layers being added (addLayer pending/fulfilled/rejected)', () => {
  it('lists each layer being added, newest first, until its request is done', () => {
    const store = createAppStore();
    const pendingNames = () =>
      (store.getState().viewer.pendingLayers ?? []).map(
        (pending) => pending.name,
      );

    store.dispatch(thunks.addLayer.pending('request-a', request('a')));
    store.dispatch(thunks.addLayer.pending('request-b', request('b')));
    expect(pendingNames()).toEqual(['b', 'a']);

    store.dispatch(
      thunks.addLayer.rejected(
        new Error('unreachable'),
        'request-b',
        request('b'),
      ),
    );
    expect(pendingNames()).toEqual(['a']);

    // Done: no longer pending, and now a layer of the map instead.
    store.dispatch(
      thunks.addLayer.fulfilled(
        {
          ...request('a'),
          name: 'a',
          id: 'layer-a',
          dimensions: [],
          enabled: true,
          opacity: 1,
          hasError: false,
          styleName: undefined,
          title: 'Layer A',
        },
        'request-a',
        request('a'),
      ),
    );
    expect(pendingNames()).toEqual([]);
    expect(
      store.getState().viewer.maps[mapId].layers.map((layer) => layer.id),
    ).toEqual(['layer-a']);
  });
});

describe('announcing an added layer (addLayer with announce)', () => {
  const fulfilled = (requestId: string, announce: boolean) =>
    thunks.addLayer.fulfilled(
      {
        ...request('a'),
        name: 'a',
        id: `layer-${requestId}`,
        dimensions: [],
        enabled: true,
        opacity: 1,
        hasError: false,
        styleName: undefined,
        title: 'Layer A',
      },
      requestId,
      { ...request('a'), announce },
    );

  it('records a notice for a layer the user added, and none for one restored from a permalink', () => {
    const store = createAppStore();

    store.dispatch(fulfilled('restored', false));
    expect(store.getState().viewer.layerAddedNotice).toBeUndefined();

    store.dispatch(fulfilled('chosen', true));
    expect(store.getState().viewer.layerAddedNotice).toEqual({
      requestId: 'chosen',
      layerName: 'a',
      layerTitle: 'Layer A',
      hasError: false,
    });
  });
});
