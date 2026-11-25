import React from 'react';
import { get as getOlProjection } from 'ol/proj';
import { IconButton, Typography } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { WMLayer } from '@opengeoweb/webmap';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { AdagucMapView, ViewerState } from '../../store/types';
import { awbColors } from '../../application/appTheme';
import { getProjectionName } from '../../utils/projections';
import { toMapBbox } from '../../utils/layerProjectionBbox';
import { getSameAreaBbox } from '../../utils/sameAreaBbox';

interface ProjectionSelectorProps {
  mapId: string;
  wmLayer: WMLayer;
}

// The projections a layer is served in, as a table: click a row to switch
// the map to it, or step through them one by one - with the buttons above
// the table, or the up and down arrow keys - to compare projections.
const ProjectionSelector = ({
  mapId,
  wmLayer,
}: ProjectionSelectorProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const view = useAppSelector(
    (state: ViewerState): AdagucMapView => state?.viewer?.maps[mapId]?.view,
  );
  const currentSrs = view?.srs;

  // What the table lists, in its order: each of the layer's projections
  // once, sorted by srs.
  const projectionItems = new Map<
    string,
    WMLayer['projectionProperties'][number]
  >();
  wmLayer?.projectionProperties.forEach((p) => {
    projectionItems.set(p.srs, p);
  });
  const rows = Array.from(projectionItems.values())
    .sort((a, b) => a.srs.localeCompare(b.srs))
    .map((p) => ({
      srs: p.srs,
      // The layer advertises whatever its server supports, but the map can
      // only switch to an srs OpenLayers has a proj4 definition for (see
      // registerExtraProjections) - show the others, but don't offer them.
      isAvailable: getOlProjection(p.srs) !== null,
      // p.bbox is a WMBBOX class instance - redux state should only hold
      // plain, serializable data. It is also in the srs's own axis order,
      // where the map needs east first.
      bbox: toMapBbox(wmLayer, p.srs, p.bbox),
    }));
  type Row = (typeof rows)[number];

  // The view last asked for, until the map shows it. The map takes a
  // moment to switch, and a key held down asks for the next projection
  // before it has: each step then carries on from the one before it, not
  // from what the map still showed - or the same step would be taken
  // twice.
  const requestedView = React.useRef<AdagucMapView | null>(null);
  React.useEffect(() => {
    // The map has moved on: to what was asked, or because the user did
    // something else with it. Either way, its own view counts again.
    requestedView.current = null;
  }, [view]);

  const switchTo = (row: Row): void => {
    // Keep looking at the same area, so projections can be compared by
    // switching between them. Only when that can't be done does the map go
    // to the layer's own extent in the new srs.
    const bbox =
      getSameAreaBbox(requestedView.current ?? view, row.srs) ?? row.bbox;
    requestedView.current = { srs: row.srs, bbox };
    dispatch(actions.requestSetProjection({ mapId, srs: row.srs, bbox }));
  };

  // The projections the map can switch to, and the one to step to from the
  // current one - around from the last to the first, and the other way.
  const availableRows = rows.filter((row) => row.isAvailable);
  const currentIndex = availableRows.findIndex((row) => row.srs === currentSrs);
  const step = (direction: 1 | -1): void => {
    if (availableRows.length === 0) {
      return;
    }
    const fromSrs = requestedView.current?.srs ?? currentSrs;
    const fromIndex = availableRows.findIndex((row) => row.srs === fromSrs);
    // From a projection that isn't in the table: to its first or last one.
    const from = fromIndex === -1 && direction === -1 ? 0 : fromIndex;
    const next =
      (from + direction + availableRows.length) % availableRows.length;
    switchTo(availableRows[next]);
  };
  const canStep =
    availableRows.length > 1 ||
    (availableRows.length === 1 && currentIndex === -1);

  // Keeps the current projection's row in view while stepping through a
  // table that is longer than the dialog.
  const selectedRow = React.useRef<HTMLTableRowElement | null>(null);
  React.useEffect(() => {
    const row = selectedRow.current;
    // (jsdom, in the tests, has no scrollIntoView.)
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [currentSrs]);

  // The up and down arrow keys step through the projections - on the
  // buttons and on the table, which is focusable so that this also works
  // after clicking one of its rows.
  const stepOnArrowKey = (event: React.KeyboardEvent): void => {
    if (!canStep || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Not also scrolling the dialog.
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  return (
    <div>
      {/* Stays at the top of the dialog while the table scrolls under it. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 0',
          background: awbColors.surface,
        }}
      >
        <IconButton
          size="small"
          aria-label="Previous projection"
          title="Previous projection (arrow up)"
          disabled={!canStep}
          onClick={() => {
            step(-1);
          }}
          onKeyDown={stepOnArrowKey}
        >
          <KeyboardArrowUpIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="Next projection"
          title="Next projection (arrow down)"
          disabled={!canStep}
          onClick={() => {
            step(1);
          }}
          onKeyDown={stepOnArrowKey}
        >
          <KeyboardArrowDownIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="caption"
          data-testid="projection-position"
          sx={{ whiteSpace: 'nowrap' }}
        >
          {currentIndex === -1
            ? (currentSrs ?? '')
            : `${currentSrs} (${currentIndex + 1} of ${availableRows.length})`}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: 'nowrap', marginLeft: 'auto' }}
        >
          ↑ ↓ keys step through the projections
        </Typography>
      </div>
      {/* A minimum width, so that in a dialog resized to less than that the
          bbox columns scroll into view instead of being squeezed to
          nothing. */}
      <table
        role="grid"
        aria-label="Projections"
        tabIndex={0}
        style={{ minWidth: '800px' }}
        onKeyDown={stepOnArrowKey}
      >
        <thead>
          <tr>
            <th style={{ width: '100px' }}>CRS</th>
            <th style={{ width: '350px' }}>Name</th>
            <th>Left</th>
            <th>Bottom</th>
            <th>Right</th>
            <th>Top</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = currentSrs === row.srs;
            let className = '';
            if (isSelected) {
              className = 'selected';
            } else if (!row.isAvailable) {
              className = 'unavailable';
            }
            return (
              <tr
                key={wmLayer.id + row.srs}
                ref={isSelected ? selectedRow : undefined}
                className={className}
                aria-disabled={!row.isAvailable}
                aria-current={isSelected ? 'true' : undefined}
                // Room for the buttons above (which stay in place below the
                // dialog's own padding) when scrolled into view.
                style={{ scrollMarginTop: '72px' }}
                title={
                  row.isAvailable
                    ? undefined
                    : `${row.srs} isn't available in this viewer yet`
                }
                onClick={() => {
                  if (row.isAvailable) {
                    switchTo(row);
                  }
                }}
              >
                <td>{row.srs}</td>
                <td>{getProjectionName(row.srs) || '--'}</td>
                <td>{row.bbox.left}</td>
                <td>{row.bbox.bottom}</td>
                <td>{row.bbox.right}</td>
                <td>{row.bbox.top}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ProjectionSelector;
