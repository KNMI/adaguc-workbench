import * as React from 'react';
import { Style, generateLayerId, getWMLayerById } from '@opengeoweb/webmap';
import { clearImageCacheForAllMaps } from '@opengeoweb/webmap-react';
import { actions, useAppDispatch, useAppSelector } from '../store/store';
import { selectors } from '../store/selectors';
import { thunks } from '../store/thunks';
import { AdagucLayer, ViewerState } from '../store/types';
import { LayerComponent } from '../components/LayerComponent/LayerComponent';

// webmap-react assigns the live OL source onto the WMLayer instance at
// `olSource` (for its own internal "metronome" use), but that isn't part
// of WMLayer's public TS type - this is just enough of a shape to call
// its (standard OL ImageSource) `refresh` method.
interface WMLayerWithOlSource {
  olSource?: { refresh?: () => void };
}

export interface ReduxLayerComponentProps {
  mapId: string;
  layerId: string;
  layerIndex: number;
  openLayerDetails: (layerId: string) => void;
}

export const ReduxLayerComponent = ({
  mapId,
  layerId,
  layerIndex,
  openLayerDetails,
}: ReduxLayerComponentProps) => {
  const dispatch = useAppDispatch();

  const selectLayer = (layerNameToChange: string) => {
    dispatch(
      actions.changeLayerName({
        mapId,
        layerIndex,
        layerName: layerNameToChange,
      }),
    );
  };

  const onDuplicateLayer = (layer: AdagucLayer) => {
    dispatch(
      actions.fullFillAddLayer({
        mapId,
        id: generateLayerId(),
        name: layer.name,
        serviceUrl: layer.serviceUrl,
        styleName: layer.style,
        enabled: layer.enabled,
        opacity: layer.opacity,
        dimensions: layer.dimensions.map((dimension) => ({ ...dimension })),
        hasError: layer.hasError,
      }),
    );
  };

  const selectStyle = (styleNameToChange: string) => {
    dispatch(
      actions.changeLayerStyle({
        mapId,
        layerIndex,
        styleName: styleNameToChange,
      }),
    );
  };

  const layer = useAppSelector((state: ViewerState): AdagucLayer | undefined =>
    selectors.getMapLayerById(state, mapId, layerId),
  );

  const layerIds = useAppSelector((state: ViewerState): string[] =>
    selectors.getMapLayerIds(state, mapId),
  );

  // Swaps this layer with the one currently at targetIndex, reusing the
  // same setLayerOrderByIds action the drag-and-drop list (SortableLayerList)
  // already uses, so both ways of reordering stay in sync.
  const moveLayer = (targetIndex: number): void => {
    if (targetIndex < 0 || targetIndex >= layerIds.length) {
      return;
    }
    const newOrder = [...layerIds];
    [newOrder[layerIndex], newOrder[targetIndex]] = [
      newOrder[targetIndex],
      newOrder[layerIndex],
    ];
    dispatch(actions.setLayerOrderByIds({ mapId, layerListIds: newOrder }));
  };

  const styleList = useAppSelector((state: ViewerState): Style[] =>
    selectors.getStyleListForLayer(state, layer),
  );

  const isAnimating = useAppSelector((state: ViewerState): boolean =>
    selectors.isMapAnimating(state, mapId),
  );

  const changeLayerDimension = (
    dimensionName: string,
    dimensionValue: string,
  ) => {
    dispatch(
      actions.changeLayerDimension({
        mapId,
        layerIndex,
        dimensionName,
        dimensionValue,
      }),
    );
  };

  const setLayerDimensionLinked = (dimensionName: string, linked: boolean) => {
    dispatch(
      actions.setLayerDimensionLinked({
        mapId,
        layerIndex,
        dimensionName,
        linked,
      }),
    );
  };

  const removeLayer = () => {
    dispatch(
      actions.removeLayer({
        mapId,
        layerIndex,
      }),
    );
  };

  const layerToggleAnimation = () => {
    dispatch(
      actions.layerToggleAnimation({
        mapId,
        layerIndex,
      }),
    );
  };

  const zoomToLayer = () => {
    dispatch(
      actions.requestZoomToLayer({
        mapId,
        layerId,
      }),
    );
  };

  const changeLayerOpacity = (opacity: number) => {
    dispatch(
      actions.layerChangeOpacity({
        mapId,
        layerIndex,
        opacity,
      }),
    );
  };

  const changeLayerEnabled = (enabled: boolean) => {
    dispatch(
      actions.layerChangeEnabled({
        mapId,
        layerIndex,
        enabled,
      }),
    );
  };

  // Forces a fresh GetCapabilities fetch for this layer, bypassing the
  // cache both the live WMLayer (dimensions, styles, getmapURL) and the
  // redux-tracked service (the layer/style pickers' own lists) would
  // otherwise keep reusing.
  const refreshLayerCapabilities = async (): Promise<void> => {
    const wmLayer = getWMLayerById(layerId);
    if (wmLayer) {
      try {
        await wmLayer.parseLayer(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(e);
      }
      // Re-parsing only refreshes the layer's capabilities - the actual
      // map imagery is cached completely separately, in webmap-react's
      // shared image store, so without also clearing that (and nudging
      // this layer's own OL source) the map would keep showing the same
      // images even though a refresh was just requested.
      clearImageCacheForAllMaps();
      (wmLayer as unknown as WMLayerWithOlSource).olSource?.refresh?.();
    }
    if (layer?.serviceUrl) {
      await dispatch(thunks.fetchWMSService(layer.serviceUrl))
        .unwrap()
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn(e);
        });
    }
  };

  // Briefly true while a removed layer's row is still being unmounted.
  if (!layer) {
    return null;
  }

  return (
    <LayerComponent
      layer={layer}
      layerIndex={layerIndex}
      key={layer?.id}
      serviceUrl={layer?.serviceUrl}
      isAnimating={isAnimating}
      onDuplicate={() => {
        onDuplicateLayer(layer);
      }}
      onSelectLayer={(_layer) => {
        selectLayer(_layer);
      }}
      openLayerDetails={(_layerId) => {
        openLayerDetails(_layerId);
      }}
      onChangeOpacity={(opacity) => {
        changeLayerOpacity(opacity);
      }}
      onChangeLayerEnabled={(enabled) => {
        changeLayerEnabled(enabled);
      }}
      getDimensionValue={(dimensionName: string): string | undefined => {
        const foundDim = layer?.dimensions?.find(
          (dim) => dim.name === dimensionName,
        );
        return foundDim?.currentValue;
      }}
      setDimensionValue={(
        dimensionName: string,
        dimensionValue: string,
      ): void => {
        changeLayerDimension(dimensionName, dimensionValue);
      }}
      getDimensionLinked={(dimensionName: string): boolean => {
        const foundDim = layer?.dimensions?.find(
          (dim) => dim.name === dimensionName,
        );
        return foundDim?.linked ?? false;
      }}
      setDimensionLinked={(dimensionName: string, linked: boolean): void => {
        setLayerDimensionLinked(dimensionName, linked);
      }}
      update={(): void => {}}
      styles={styleList}
      selectedStyleName={layer?.style}
      onSelectStyle={(style: string): void => {
        selectStyle(style);
      }}
      removeLayer={() => {
        removeLayer();
      }}
      layerToggleAnimation={() => {
        layerToggleAnimation();
      }}
      zoomToLayer={() => {
        zoomToLayer();
      }}
      onMoveUp={() => {
        moveLayer(layerIndex - 1);
      }}
      onMoveDown={() => {
        moveLayer(layerIndex + 1);
      }}
      canMoveUp={layerIndex > 0}
      canMoveDown={layerIndex < layerIds.length - 1}
      onRefreshLayer={refreshLayerCapabilities}
    />
  );
};
