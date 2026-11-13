import { View } from 'ol';
import { fitViewToBbox } from './fitViewToBbox';

// A real OpenLayers view - without a map it fits to a default 100x100 size.
const makeView = (): View =>
  new View({ projection: 'EPSG:3857', center: [0, 0], zoom: 1 });

describe('fitViewToBbox', () => {
  it('centers on a bbox whose left edge is exactly 0', () => {
    // Regression guard: opengeoweb's setViewFromExtent treats left: 0 as
    // "no bbox" and falls back to zoom level 1 - the "Netherlands - RD
    // NEW" predefined area (left: 0) showed the whole world.
    const view = makeView();

    fitViewToBbox(view, {
      left: 0,
      bottom: 300000,
      right: 280000,
      top: 625000,
    });

    expect(view.getCenter()).toEqual([140000, 462500]);
    expect(view.getZoom()).toBeGreaterThan(1);
  });

  it('falls back to zoom level 1 around 0,0 without a usable bbox', () => {
    const view = makeView();
    view.setCenter([5, 5]);
    view.setZoom(6);

    fitViewToBbox(view, undefined);

    expect(view.getCenter()).toEqual([0, 0]);
    expect(view.getZoom()).toBe(1);
  });

  it('centers on the point an empty bbox describes', () => {
    const view = makeView();

    fitViewToBbox(view, { left: 10, bottom: 20, right: 10, top: 20 });

    expect(view.getCenter()).toEqual([10, 20]);
  });
});
