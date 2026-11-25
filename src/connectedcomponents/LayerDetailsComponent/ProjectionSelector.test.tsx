import * as React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { WMLayer } from '@opengeoweb/webmap';
import { emptyMap, renderWithStore } from '../../testUtils/renderWithStore';
import type { AdagucMapView } from '../../store/types';
import { actions } from '../../store/store';
import ProjectionSelector from './ProjectionSelector';
import { registerExtraProjections } from '../../utils/registerExtraProjections';

const mapId = 'map1';

const wmLayer = {
  id: 'layer-1',
  projectionProperties: [
    {
      srs: 'EPSG:4326',
      bbox: { left: -180, bottom: -90, right: 180, top: 90 },
    },
    {
      srs: 'EPSG:3857',
      bbox: { left: -2e7, bottom: -2e7, right: 2e7, top: 2e7 },
    },
  ],
} as unknown as WMLayer;

// The Netherlands in the base map's own projection: 3.2-7.3 degrees east,
// 50.7-53.6 north.
const viewOfTheNetherlands = {
  srs: 'EPSG:3857',
  bbox: { left: 356222, bottom: 6571000, right: 812632, top: 7090000 },
};

// The real store and the real OpenLayers projection list: EPSG:4326 and
// EPSG:3857 are built into OpenLayers, and the map starts out in 3857.
const renderSelector = (
  layer: WMLayer = wmLayer,
  view: AdagucMapView = viewOfTheNetherlands,
) =>
  renderWithStore(<ProjectionSelector mapId={mapId} wmLayer={layer} />, {
    [mapId]: emptyMap({ view }),
  });

describe('ProjectionSelector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header cells inside a table row, without a DOM nesting error', () => {
    // Regression guard: the <th> cells used to sit directly inside <thead>
    // with no <tr> around them - invalid table markup, which React reports
    // as a console error every time the Layer settings dialog opens.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderSelector();

    const [headerRow] = screen.getAllByRole('row');
    expect(
      within(headerRow)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['CRS', 'Name', 'Left', 'Bottom', 'Right', 'Top']);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('lists projections sorted by SRS and switches the map to one when its row is clicked', () => {
    const { store } = renderSelector();

    const [, firstRow, secondRow] = screen.getAllByRole('row');
    expect(within(firstRow).getByText('EPSG:3857')).toBeInTheDocument();
    expect(within(firstRow).getByText(/Pseudo-Mercator/)).toBeInTheDocument();
    expect(firstRow).toHaveClass('selected');
    expect(within(secondRow).getByText('EPSG:4326')).toBeInTheDocument();

    fireEvent.click(secondRow);

    expect(store.getState().viewer.maps[mapId].viewCommand).toMatchObject({
      srs: 'EPSG:4326',
    });
  });

  it('keeps the map on the area it was showing when switching projection', () => {
    const { store } = renderSelector();

    fireEvent.click(screen.getByText('EPSG:4326'));

    // Still the Netherlands - not the layer's own extent in EPSG:4326,
    // which is the whole world.
    const { bbox } = store.getState().viewer.maps[mapId].viewCommand ?? {};
    expect(((bbox?.left ?? NaN) + (bbox?.right ?? NaN)) / 2).toBeCloseTo(
      5.25,
      1,
    );
    expect(((bbox?.bottom ?? NaN) + (bbox?.top ?? NaN)) / 2).toBeCloseTo(
      52.17,
      1,
    );
    expect((bbox?.right ?? NaN) - (bbox?.left ?? NaN)).toBeLessThan(10);
  });

  it("goes to the layer's extent when the area the map was showing cannot be kept", () => {
    // A view that is not usable to start from, as before the map has
    // reported its first one.
    const { store } = renderSelector(wmLayer, {
      srs: 'EPSG:3857',
      bbox: { left: 0, bottom: 0, right: 0, top: 0 },
    });

    fireEvent.click(screen.getByText('EPSG:4326'));

    expect(store.getState().viewer.maps[mapId].viewCommand).toMatchObject({
      srs: 'EPSG:4326',
      bbox: { left: -180, bottom: -90, right: 180, top: 90 },
    });
  });

  it('shows an srs the viewer has no projection for, but does not switch to it on click', () => {
    // Regression guard: switching the map to an srs OpenLayers doesn't know
    // (e.g. one only this layer's server advertises) used to crash the
    // whole app in makeView ("Cannot read properties of null (reading
    // 'getExtent')").
    const layerWithUnknownSrs = {
      id: 'layer-2',
      projectionProperties: [
        {
          srs: 'EPSG:9999',
          bbox: { left: 0, bottom: 0, right: 1, top: 1 },
        },
      ],
    } as unknown as WMLayer;
    const { store } = renderSelector(layerWithUnknownSrs);

    const [, row] = screen.getAllByRole('row');
    expect(within(row).getByText('EPSG:9999')).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveClass('unavailable');

    fireEvent.click(row);

    expect(store.getState().viewer.maps[mapId].viewCommand).toBeUndefined();
  });

  it('shows and applies the bbox of a north-first srs east first', () => {
    // Regression guard: under WMS 1.3 the server lists the BoundingBox of
    // an srs like EPSG:4258 or EPSG:3035 north first. Used as it was, the
    // map opened somewhere else entirely (the Netherlands' latitudes taken
    // as longitudes).
    registerExtraProjections();
    const layerWithNorthFirstSrs = {
      id: 'layer-3',
      version: '1.3.0',
      projectionProperties: [
        {
          srs: 'EPSG:4258',
          bbox: { left: 48.9, bottom: 0, right: 56, top: 10.9 },
        },
      ],
    } as unknown as WMLayer;
    // Without a usable view to keep, so the layer's own extent is applied.
    const { store } = renderSelector(layerWithNorthFirstSrs, {
      srs: 'EPSG:3857',
      bbox: { left: 0, bottom: 0, right: 0, top: 0 },
    });

    const [, row] = screen.getAllByRole('row');
    expect(
      within(row)
        .getAllByRole('cell')
        .slice(2)
        .map((cell) => cell.textContent),
    ).toEqual(['0', '48.9', '10.9', '56']);

    fireEvent.click(row);

    expect(store.getState().viewer.maps[mapId].viewCommand).toMatchObject({
      srs: 'EPSG:4258',
      bbox: { left: 0, bottom: 48.9, right: 10.9, top: 56 },
    });
  });

  describe('stepping through the projections', () => {
    // Sorted as the table shows them: EPSG:3857, EPSG:4326, EPSG:9999 - the
    // last of which the viewer has no projection for.
    const layerWithUnavailableSrs = {
      id: 'layer-4',
      projectionProperties: [
        ...wmLayer.projectionProperties,
        {
          srs: 'EPSG:9999',
          bbox: { left: 0, bottom: 0, right: 1, top: 1 },
        },
      ],
    } as unknown as WMLayer;

    const viewIn = (srs: string): AdagucMapView => ({
      srs,
      bbox: { left: 3, bottom: 50, right: 8, top: 54 },
    });

    const requestedSrs = (
      store: ReturnType<typeof renderSelector>['store'],
    ): string | undefined =>
      store.getState().viewer.maps[mapId].viewCommand?.srs;

    it('goes to the next projection with the down button', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);

      fireEvent.click(screen.getByLabelText('Next projection'));

      expect(requestedSrs(store)).toBe('EPSG:4326');
    });

    it('goes around to the first projection after the last, skipping one the viewer cannot show', () => {
      const { store } = renderSelector(
        layerWithUnavailableSrs,
        viewIn('EPSG:4326'),
      );

      fireEvent.click(screen.getByLabelText('Next projection'));

      expect(requestedSrs(store)).toBe('EPSG:3857');
    });

    it('goes to the previous projection with the up button, around from the first to the last', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);

      fireEvent.click(screen.getByLabelText('Previous projection'));

      expect(requestedSrs(store)).toBe('EPSG:4326');
    });

    it('steps with the arrow keys on the table, without also scrolling the dialog', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);
      const table = screen.getByRole('grid', { name: 'Projections' });

      // fireEvent returns false when the event's default was prevented.
      expect(fireEvent.keyDown(table, { key: 'ArrowDown' })).toBe(false);
      expect(requestedSrs(store)).toBe('EPSG:4326');

      expect(fireEvent.keyDown(table, { key: 'ArrowUp' })).toBe(false);
      expect(requestedSrs(store)).toBe('EPSG:3857');
    });

    it('carries on from the step before it while the map has not switched yet', () => {
      // Regression guard: with a key held down the next step is asked for
      // before the map shows the previous one. Counted from what the map
      // still showed, every such step asked for the same projection again.
      // (No map in this test, so the view in redux never moves.)
      const layerWithThreeSrs = {
        id: 'layer-6',
        projectionProperties: [
          ...wmLayer.projectionProperties,
          {
            srs: 'CRS:84',
            bbox: { left: -180, bottom: -90, right: 180, top: 90 },
          },
        ],
      } as unknown as WMLayer;
      // Sorted: CRS:84, EPSG:3857 (where the map is), EPSG:4326.
      const { store } = renderSelector(layerWithThreeSrs);
      const table = screen.getByRole('grid', { name: 'Projections' });

      fireEvent.keyDown(table, { key: 'ArrowDown' });
      expect(requestedSrs(store)).toBe('EPSG:4326');
      fireEvent.keyDown(table, { key: 'ArrowDown' });
      expect(requestedSrs(store)).toBe('CRS:84');
      fireEvent.keyDown(table, { key: 'ArrowDown' });
      expect(requestedSrs(store)).toBe('EPSG:3857');

      // Still the Netherlands after three steps: each one keeps the area
      // of the step before it.
      const { bbox } = store.getState().viewer.maps[mapId].viewCommand ?? {};
      expect(bbox?.left).toBeCloseTo(viewOfTheNetherlands.bbox.left, 0);
      expect(bbox?.top).toBeCloseTo(viewOfTheNetherlands.bbox.top, 0);
    });

    it('counts from the map again once its view has changed', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);
      const table = screen.getByRole('grid', { name: 'Projections' });
      fireEvent.keyDown(table, { key: 'ArrowDown' });
      expect(requestedSrs(store)).toBe('EPSG:4326');

      // The user pans the map, which - in this test - never switched.
      act(() => {
        store.dispatch(
          actions.updateMapView({
            mapId,
            view: {
              srs: 'EPSG:3857',
              bbox: { left: 0, bottom: 6000000, right: 400000, top: 6500000 },
            },
          }),
        );
      });
      fireEvent.keyDown(table, { key: 'ArrowUp' });

      // From EPSG:3857 again, and around the place panned to.
      expect(requestedSrs(store)).toBe('EPSG:4326');
      const { bbox } = store.getState().viewer.maps[mapId].viewCommand ?? {};
      expect(((bbox?.left ?? NaN) + (bbox?.right ?? NaN)) / 2).toBeCloseTo(
        1.8,
        1,
      );
    });

    it('steps with the arrow keys while a button has the focus', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);

      fireEvent.keyDown(screen.getByLabelText('Next projection'), {
        key: 'ArrowDown',
      });

      expect(requestedSrs(store)).toBe('EPSG:4326');
    });

    it('leaves other keys, and arrow keys with a modifier, alone', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);
      const table = screen.getByRole('grid', { name: 'Projections' });

      expect(fireEvent.keyDown(table, { key: 'ArrowRight' })).toBe(true);
      expect(
        fireEvent.keyDown(table, { key: 'ArrowDown', ctrlKey: true }),
      ).toBe(true);
      expect(fireEvent.keyDown(table, { key: 'Enter' })).toBe(true);

      expect(requestedSrs(store)).toBeUndefined();
    });

    it('keeps the map on the area it was showing, like a click on a row', () => {
      const { store } = renderSelector(layerWithUnavailableSrs);

      fireEvent.click(screen.getByLabelText('Next projection'));

      const { bbox } = store.getState().viewer.maps[mapId].viewCommand ?? {};
      expect(((bbox?.left ?? NaN) + (bbox?.right ?? NaN)) / 2).toBeCloseTo(
        5.25,
        1,
      );
    });

    it('shows which of the projections the map is in', () => {
      renderSelector(layerWithUnavailableSrs, viewIn('EPSG:4326'));

      // Of the two the viewer can show.
      expect(screen.getByTestId('projection-position')).toHaveTextContent(
        'EPSG:4326 (2 of 2)',
      );
      expect(screen.getByText('EPSG:4326').closest('tr')).toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    it('starts from the first or the last projection when the map is in one the layer does not list', () => {
      const first = renderSelector(layerWithUnavailableSrs, viewIn('CRS:84'));
      expect(screen.getByTestId('projection-position')).toHaveTextContent(
        'CRS:84',
      );
      fireEvent.click(screen.getByLabelText('Next projection'));
      expect(requestedSrs(first.store)).toBe('EPSG:3857');
      first.unmount();

      const second = renderSelector(layerWithUnavailableSrs, viewIn('CRS:84'));
      fireEvent.click(screen.getByLabelText('Previous projection'));
      expect(requestedSrs(second.store)).toBe('EPSG:4326');
    });

    it('has nothing to step to with a single projection', () => {
      const layerWithOneSrs = {
        id: 'layer-5',
        projectionProperties: [wmLayer.projectionProperties[1]],
      } as unknown as WMLayer;
      const { store } = renderSelector(layerWithOneSrs);

      expect(screen.getByLabelText('Next projection')).toBeDisabled();
      expect(screen.getByLabelText('Previous projection')).toBeDisabled();
      fireEvent.keyDown(screen.getByRole('grid', { name: 'Projections' }), {
        key: 'ArrowDown',
      });
      expect(requestedSrs(store)).toBeUndefined();
    });
  });
});
