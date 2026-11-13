import * as React from 'react';
import { ReactSortable } from 'react-sortablejs';
import { actions, useAppDispatch, useAppSelector } from '../store/store';
import { selectors } from '../store/selectors';
import { ViewerState } from '../store/types';
import { ReduxLayerComponent } from './ReduxLayerComponent';
import LayerDetailDialog from './LayerDetailsComponent/LayerDetailDialog';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';

export interface SortableLayerListProps {
  mapId: string;
}

export const SortableLayerList = ({
  mapId,
}: SortableLayerListProps): React.ReactElement<SortableLayerListProps> => {
  const dispatch = useAppDispatch();

  const [layerDetailsForLayerId, openlayerDetails] = React.useState<
    string | null
  >(null);
  const setLayerOrderByIds = (layerListIds: string[]) => {
    dispatch(actions.setLayerOrderByIds({ mapId, layerListIds }));
  };
  const layersInMap = useAppSelector((state: ViewerState): string[] =>
    selectors.getMapLayerIds(state, mapId),
  );
  return (
    <div
      style={{
        overflowY: 'scroll',
        width: 'inherit',
        height: '100%',
        background:
          'repeating-linear-gradient(-35deg,#D3CDE8,#D3CDE8 8px,#D1CBE6 8px, #D1CBE6 16px)',
      }}
    >
      {layerDetailsForLayerId !== null && (
        <LayerDetailDialog
          mapId={mapId}
          isDialogOpen
          layerId={layerDetailsForLayerId}
          onClose={() => {
            openlayerDetails(null);
          }}
        />
      )}
      <ReactSortable
        setList={(newList) => {
          if (layersInMap.join() === newList.map((it) => it.id).join()) {
            return;
          }
          setLayerOrderByIds(newList.map((it) => it.id));
        }}
        list={layersInMap.map((l) => {
          return { id: l };
        })}
        // Without a handle, SortableJS treats a mousedown ANYWHERE in a
        // layer card (including dragging a dimension/opacity slider's
        // thumb) as the start of a reorder-drag of the whole card - this
        // excludes every interactive control a layer card renders from
        // being able to start one instead, leaving those still fully
        // usable (preventOnFilter: false, so SortableJS doesn't swallow
        // their own mousedown handling).
        filter="input, button, [role='button'], .MuiSlider-root"
        preventOnFilter={false}
      >
        {layersInMap.map((layerId, k): React.ReactElement => {
          return (
            <ErrorBoundary
              key={layerId}
              fallbackMessage="Layer unavailable"
              onRemove={() => {
                dispatch(actions.removeLayer({ mapId, layerIndex: k }));
              }}
            >
              <ReduxLayerComponent
                layerId={layerId}
                mapId={mapId}
                layerIndex={k}
                openLayerDetails={(__layerId) => {
                  openlayerDetails(__layerId);
                }}
              />
            </ErrorBoundary>
          );
        })}
      </ReactSortable>
    </div>
  );
};
