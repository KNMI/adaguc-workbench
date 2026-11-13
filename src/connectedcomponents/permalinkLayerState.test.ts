import { AdagucLayer, AdagucMap } from '../store/types';
import {
  formatAnimation,
  formatBaseLayers,
  formatCollapsedPanels,
  formatLayerDimensions,
  parseAnimation,
  parseBaseLayers,
  parseCollapsedPanels,
  parseLayerDimensions,
} from './permalinkLayerState';

const layer = (
  id: string,
  dimensions: AdagucLayer['dimensions'],
): AdagucLayer => ({
  id,
  name: id,
  serviceUrl: 'https://example.com/wms?',
  style: '',
  enabled: true,
  opacity: 1,
  dimensions,
});

describe('layerdims', () => {
  it("round-trips every layer's own values and link checkboxes", () => {
    const layers = [
      layer('a', [
        { name: 'time', currentValue: '2026-11-13T12:10:00Z', linked: true },
        { name: 'elevation', currentValue: '850' },
      ]),
      layer('b', [
        { name: 'time', currentValue: '2026-11-13T12:00:00Z', linked: false },
      ]),
    ];

    const param = formatLayerDimensions(layers);

    expect(param).toBe(
      '0$time$2026-11-13T12:10:00Z$1,0$elevation$850$0,1$time$2026-11-13T12:00:00Z$0',
    );
    expect(parseLayerDimensions(param)).toEqual([
      {
        layerIndex: 0,
        name: 'time',
        value: '2026-11-13T12:10:00Z',
        linked: true,
      },
      { layerIndex: 0, name: 'elevation', value: '850', linked: false },
      {
        layerIndex: 1,
        name: 'time',
        value: '2026-11-13T12:00:00Z',
        linked: false,
      },
    ]);
  });

  it('keeps values containing the separators ($ and ,) or % intact', () => {
    const param = formatLayerDimensions([
      layer('a', [{ name: 'member', currentValue: 'a$b,c%d' }]),
    ]);

    expect(parseLayerDimensions(param)).toEqual([
      { layerIndex: 0, name: 'member', value: 'a$b,c%d', linked: false },
    ]);
  });

  it("skips entries it can't make sense of, keeping the rest", () => {
    expect(parseLayerDimensions('x$time$v$1,0$time,1$$v$0,2$time$v$1')).toEqual(
      [{ layerIndex: 2, name: 'time', value: 'v', linked: true }],
    );
    expect(parseLayerDimensions(null)).toEqual([]);
  });
});

describe('animate', () => {
  const map = (overrides: Partial<AdagucMap>): AdagucMap => ({
    isAnimating: false,
    isGetFeatureInfoActive: false,
    isHistogramBoxSelectActive: false,
    layers: [layer('a', []), layer('b', [])],
    view: { srs: 'EPSG:3857', bbox: { left: 0, bottom: 0, right: 1, top: 1 } },
    ...overrides,
  });

  it('names the animated layer by its position, and the scope', () => {
    expect(
      formatAnimation(
        map({ isAnimating: true, animation: { layerId: 'b', scope: 'group' } }),
      ),
    ).toBe('1$group');
    expect(parseAnimation('1$group')).toEqual({
      layerIndex: 1,
      scope: 'group',
    });
    expect(parseAnimation('0$all')).toEqual({ layerIndex: 0, scope: 'all' });
  });

  it('writes nothing while not animating', () => {
    expect(
      formatAnimation(map({ animation: { layerId: 'b', scope: 'group' } })),
    ).toBeUndefined();
    expect(formatAnimation(map({ isAnimating: true }))).toBeUndefined();
  });

  it('ignores a missing or unreadable value', () => {
    expect(parseAnimation(null)).toBeUndefined();
    expect(parseAnimation('')).toBeUndefined();
    expect(parseAnimation('x$all')).toBeUndefined();
  });
});

describe('baselayers', () => {
  const known = ['baselayer-a', 'baselayer-b', 'overlay-c'];

  it('lists the ids of the switched-on base maps and overlays', () => {
    expect(
      formatBaseLayers(
        known.map((id) => ({
          id,
          name: id,
          layerType: 'baseLayer',
          enabled: id !== 'baselayer-a',
        })) as never,
      ),
    ).toBe('baselayer-b,overlay-c');
  });

  it('reads them back, ignoring ids it does not know', () => {
    expect(parseBaseLayers('baselayer-b,gone,overlay-c', known)).toEqual([
      'baselayer-b',
      'overlay-c',
    ]);
  });

  it('switches everything off for a present but empty parameter', () => {
    expect(parseBaseLayers('', known)).toEqual([]);
  });

  it('leaves the defaults alone without the parameter, or with only unknown ids', () => {
    expect(parseBaseLayers(null, known)).toBeUndefined();
    expect(parseBaseLayers('renamed-preset', known)).toBeUndefined();
  });
});

describe('collapsed', () => {
  it('lists only the collapsed panels', () => {
    expect(formatCollapsedPanels({ layers: false, tools: true })).toBe(
      'layers',
    );
    expect(formatCollapsedPanels({ layers: false, tools: false })).toBe(
      'layers,tools',
    );
    expect(formatCollapsedPanels({ layers: true, tools: true })).toBe('');
  });

  it('reads them back, ignoring anything it does not recognise', () => {
    expect(parseCollapsedPanels('tools,sidebar')).toEqual(['tools']);
    expect(parseCollapsedPanels(null)).toEqual([]);
  });
});
