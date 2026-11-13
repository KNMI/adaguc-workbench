import { parseAddLayerHash, handleAddLayerHash } from './handleAddLayerHashTag';
import { thunks } from '../store/thunks';
import { AdagucLayer } from '../store/types';

vi.mock('../store/thunks', () => ({
  thunks: { addLayer: vi.fn() },
}));

const mockAddLayer = vi.mocked(thunks.addLayer);

const mapId = 'map1';
const serviceUrl =
  'https://geoservices.knmi.nl/adagucserver?dataset=adaguc.tests.ahn_utrechtse_heuvelrug_500m&';
const name = 'ahn_utrechtseheuvelrug_500m';

const setHash = (hash: string): void => {
  window.location.hash = hash;
};

describe('parseAddLayerHash', () => {
  afterEach(() => {
    setHash('');
  });

  it("parses adaguc-viewer's addlayer('<service>','<name>') syntax", () => {
    expect(parseAddLayerHash(`#addlayer('${serviceUrl}','${name}')`)).toEqual({
      serviceUrl,
      name,
    });
  });

  it('works without the leading #, in case the caller already stripped it', () => {
    expect(parseAddLayerHash(`addlayer('${serviceUrl}','${name}')`)).toEqual({
      serviceUrl,
      name,
    });
  });

  it("un-escapes Firefox's automatic %27 encoding of the quotes", () => {
    expect(
      parseAddLayerHash(`#addlayer(%27${serviceUrl}%27,%27${name}%27)`),
    ).toEqual({ serviceUrl, name });
  });

  it('returns null for an unrelated or malformed hash', () => {
    expect(parseAddLayerHash('')).toBeNull();
    expect(parseAddLayerHash('#somethingelse')).toBeNull();
    expect(parseAddLayerHash("#addlayer('onlyoneargument')")).toBeNull();
  });
});

describe('handleAddLayerHash', () => {
  const makeLayer = (overrides: Partial<AdagucLayer> = {}): AdagucLayer => ({
    id: 'layer-1',
    name,
    serviceUrl,
    style: 'default',
    dimensions: [],
    enabled: true,
    opacity: 1,
    ...overrides,
  });

  beforeEach(() => {
    mockAddLayer.mockImplementation(
      (payload: unknown) =>
        ({ type: 'maps/addLayer', payload }) as unknown as ReturnType<
          typeof thunks.addLayer
        >,
    );
  });

  afterEach(() => {
    setHash('');
    vi.clearAllMocks();
  });

  it('adds the layer from the hash when it is not already on the map', () => {
    setHash(`#addlayer('${serviceUrl}','${name}')`);
    const dispatch = vi
      .fn()
      .mockReturnValue({ unwrap: () => Promise.resolve() });

    handleAddLayerHash(mapId, dispatch, []);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'maps/addLayer',
      payload: { mapId, serviceUrl, name },
    });
  });

  it('does not re-add a layer that is already on the map (same dedup rule as adaguc-viewer)', () => {
    setHash(`#addlayer('${serviceUrl}','${name}')`);
    const dispatch = vi.fn();

    handleAddLayerHash(mapId, dispatch, [makeLayer()]);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the hash is not an addlayer(...) command', () => {
    setHash('#somethingelse');
    const dispatch = vi.fn();

    handleAddLayerHash(mapId, dispatch, []);

    expect(dispatch).not.toHaveBeenCalled();
    // An unrelated hash isn't this handler's to touch - leave it as-is.
    expect(window.location.hash).toBe('#somethingelse');
  });

  it('clears the addlayer(...) hash once handled, so the url goes back to looking clean', () => {
    setHash(`#addlayer('${serviceUrl}','${name}')`);
    const dispatch = vi
      .fn()
      .mockReturnValue({ unwrap: () => Promise.resolve() });

    handleAddLayerHash(mapId, dispatch, []);

    expect(window.location.hash).toBe('');
  });

  it('clears the hash even when the layer was already on the map (dedup case)', () => {
    setHash(`#addlayer('${serviceUrl}','${name}')`);
    const dispatch = vi.fn();

    handleAddLayerHash(mapId, dispatch, [makeLayer()]);

    expect(window.location.hash).toBe('');
  });
});
