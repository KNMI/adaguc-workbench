import React from 'react';
import { get as getOlProjection } from 'ol/proj';
import { WMLayer } from '@opengeoweb/webmap';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { AdagucMapView, ViewerState } from '../../store/types';
import ProjectionNameMappings from './ProjectionNameMappings';

interface ProjectionSelectorProps {
  mapId: string;
  wmLayer: WMLayer;
}
const ProjectionSelector = ({
  mapId,
  wmLayer,
}: ProjectionSelectorProps): React.ReactElement => {
  const dispatch = useAppDispatch();
  const view = useAppSelector(
    (state: ViewerState): AdagucMapView => state?.viewer?.maps[mapId]?.view,
  );
  const currentSrs = view?.srs;

  const projectionItems = new Map<
    string,
    WMLayer['projectionProperties'][number]
  >();
  wmLayer?.projectionProperties.forEach((p) => {
    projectionItems.set(p.srs, p);
  });

  return (
    <table>
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
        {Array.from(projectionItems.values())
          .sort((a, b) => a.srs.localeCompare(b.srs))
          .map((p) => {
            // The layer advertises whatever its server supports, but the map
            // can only switch to an srs OpenLayers has a proj4 definition
            // for (see registerExtraProjections) - show the others, but
            // don't offer them.
            const isAvailable = getOlProjection(p.srs) !== null;
            let className = '';
            if (currentSrs === p.srs) {
              className = 'selected';
            } else if (!isAvailable) {
              className = 'unavailable';
            }
            return (
              <tr
                key={wmLayer.id + p.srs}
                className={className}
                aria-disabled={!isAvailable}
                title={
                  isAvailable
                    ? undefined
                    : `${p.srs} isn't available in this viewer yet`
                }
                onClick={() => {
                  if (!isAvailable) {
                    return;
                  }
                  dispatch(
                    actions.requestSetProjection({
                      mapId,
                      srs: p.srs,
                      // p.bbox is a WMBBOX class instance - redux state
                      // should only hold plain, serializable data.
                      bbox: {
                        left: p.bbox.left,
                        bottom: p.bbox.bottom,
                        right: p.bbox.right,
                        top: p.bbox.top,
                      },
                    }),
                  );
                }}
              >
                <td>{p.srs}</td>
                <td>{ProjectionNameMappings[p.srs] || '--'}</td>
                <td>{p.bbox.left}</td>
                <td>{p.bbox.bottom}</td>
                <td>{p.bbox.right}</td>
                <td>{p.bbox.top}</td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
};

export default ProjectionSelector;
