import * as React from 'react';
import { render } from '@testing-library/react';
import type Feature from 'ol/Feature';
import type VectorLayer from 'ol/layer/Vector';
import { Style } from 'ol/style';
import { MapContext } from '@opengeoweb/webmap-react';
import OpenLayersGraticule, { graticuleFeatures } from './OpenLayersGraticule';

vi.mock('@opengeoweb/webmap-react', async () => {
  const ReactLib = await import('react');
  return {
    MapContext: ReactLib.createContext({ map: null }),
  };
});

// Europe, and then the Netherlands within it, in the base map's projection.
const europe = [-2000000, 3000000, 4000000, 9000000];
const netherlands = [356222, 6571000, 812632, 7090000];

// A stand-in for the OpenLayers map: just what the graticule uses of it,
// with a view the test can move and a rendering it can trigger.
const makeFakeMap = () => {
  let extent = europe;
  let srs = 'EPSG:3857';
  let size: number[] | undefined = [600, 600];
  const layers: VectorLayer[] = [];
  const postrenderListeners = new Set<() => void>();
  const map = {
    addLayer: vi.fn((layer: VectorLayer) => {
      layers.push(layer);
    }),
    removeLayer: vi.fn((layer: VectorLayer) => {
      layers.splice(layers.indexOf(layer), 1);
    }),
    getSize: () => size,
    getView: () => ({
      isDef: () => true,
      calculateExtent: () => extent,
      getProjection: () => ({ getCode: () => srs }),
    }),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'postrender') {
        postrenderListeners.add(listener);
      }
      return { listener, target: map, type: event };
    }),
    // What OpenLayers' unByKey calls on the listener's target.
    removeEventListener: vi.fn((_event: string, listener: () => void) => {
      postrenderListeners.delete(listener);
    }),
  };
  return {
    map,
    layers,
    postrenderListeners,
    showView: (newExtent: number[], newSrs = 'EPSG:3857'): void => {
      extent = newExtent;
      srs = newSrs;
    },
    setSize: (newSize: number[] | undefined): void => {
      size = newSize;
    },
    renderMap: (): void => {
      postrenderListeners.forEach((listener) => {
        listener();
      });
    },
  };
};

const renderGraticule = (
  fake: ReturnType<typeof makeFakeMap>,
  zIndex = 10005,
) =>
  render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <MapContext.Provider value={{ map: fake.map } as any}>
      <OpenLayersGraticule zIndex={zIndex} />
    </MapContext.Provider>,
  );

const featuresOf = (layer: VectorLayer): Feature[] =>
  (layer.getSource()?.getFeatures() ?? []) as Feature[];

// The texts of the labels on the layer - the features styled with a text.
const labelsOf = (layer: VectorLayer): string[] =>
  featuresOf(layer).flatMap((feature) => {
    const style = feature.getStyle();
    const text = style instanceof Style ? style.getText()?.getText() : null;
    return typeof text === 'string' ? [text] : [];
  });

describe('OpenLayersGraticule', () => {
  it('adds a layer with the lines for what the map shows, above the other layers', () => {
    const fake = makeFakeMap();

    renderGraticule(fake);

    expect(fake.layers).toHaveLength(1);
    expect(fake.layers[0].getZIndex()).toBe(10005);
    // Europe at about ten lines each way: every 5 degrees.
    expect(labelsOf(fake.layers[0])).toEqual(
      expect.arrayContaining(['0°', '5°E', '10°E', '45°N', '50°N']),
    );
  });

  it('follows the map: finer lines once it is zoomed in', () => {
    const fake = makeFakeMap();
    renderGraticule(fake);

    fake.showView(netherlands);
    fake.renderMap();

    expect(labelsOf(fake.layers[0])).toEqual(
      expect.arrayContaining(['4.5°E', '5.0°E', '52.0°N', '52.2°N']),
    );
    expect(labelsOf(fake.layers[0])).not.toContain('10°E');
  });

  it('follows the map into another projection', () => {
    const fake = makeFakeMap();
    renderGraticule(fake);

    fake.showView([3, 50, 8, 54], 'EPSG:4326');
    fake.renderMap();

    expect(labelsOf(fake.layers[0])).toEqual(
      expect.arrayContaining(['4.0°E', '4.5°E', '51.0°N', '51.5°N']),
    );
  });

  it('leaves the lines alone while the map shows the same view', () => {
    // Regression guard: changing the lines makes the map render again, so
    // redrawing them on every rendering would never end.
    const fake = makeFakeMap();
    renderGraticule(fake);
    const before = featuresOf(fake.layers[0]);

    fake.renderMap();
    fake.renderMap();

    const after = featuresOf(fake.layers[0]);
    expect(after).toHaveLength(before.length);
    // The very same features, not new ones for the same lines.
    expect(after[0]).toBe(before[0]);
  });

  it('waits for the map to have a size', () => {
    const fake = makeFakeMap();
    fake.setSize(undefined);

    renderGraticule(fake);
    expect(labelsOf(fake.layers[0])).toEqual([]);

    fake.setSize([600, 600]);
    fake.renderMap();
    expect(labelsOf(fake.layers[0]).length).toBeGreaterThan(0);
  });

  it('takes its layer off the map, and stops following it, when switched off', () => {
    const fake = makeFakeMap();
    const { unmount } = renderGraticule(fake);
    const [layer] = fake.layers;

    unmount();

    expect(fake.map.removeLayer).toHaveBeenCalledWith(layer);
    expect(fake.layers).toHaveLength(0);
    expect(fake.postrenderListeners.size).toBe(0);
  });

  it('draws nothing without a map', () => {
    expect(() => {
      render(<OpenLayersGraticule zIndex={1} />);
    }).not.toThrow();
  });
});

describe('graticuleFeatures', () => {
  it('gives a line for each meridian and parallel, and a label for those in view', () => {
    const features = graticuleFeatures(europe, 'EPSG:3857');

    const kinds = features.map((feature) => feature.getGeometry()?.getType());
    const lineCount = kinds.filter((kind) => kind === 'MultiLineString').length;
    const labelCount = kinds.filter((kind) => kind === 'Point').length;
    // About ten meridians and ten parallels in view, each with its label -
    // and a few more lines just outside the view, which have none.
    expect(labelCount).toBeGreaterThanOrEqual(14);
    expect(labelCount).toBeLessThanOrEqual(26);
    expect(lineCount).toBeGreaterThanOrEqual(labelCount);
    expect(lineCount).toBeLessThanOrEqual(labelCount + 8);
  });

  it('gives nothing for an srs the viewer has no projection for', () => {
    expect(graticuleFeatures(europe, 'EPSG:9999')).toEqual([]);
  });
});
