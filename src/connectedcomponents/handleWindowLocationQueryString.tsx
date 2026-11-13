import { Bbox } from '@opengeoweb/webmap';
import { getWMLayer } from '../utils/getWMLayer';
import { AppThunkDispatch, actions } from '../store/store';
import { thunks } from '../store/thunks';
import { AdagucBaseLayer, AdagucMap } from '../store/types';
import { DEFAULT_BASE_LAYERS } from '../utils/baseLayerPresets';
import {
  formatAnimation,
  formatBaseLayers,
  formatLayerDimensions,
  parseAnimation,
  parseBaseLayers,
  parseLayerDimensions,
} from './permalinkLayerState';

const URLEncode = (value: string): string => encodeURIComponent(value);

// Parses the "left,bottom,right,top" string makePermaLink produces, into a
// plain Bbox object. Deliberately not a WMBBOX instance: its bound methods
// make it a class instance rather than a plain object, which Redux (and
// the Redux DevTools extension, which structured-clones every dispatched
// action) can't serialize - that clone failure stops the dispatch dead, so
// none of the code after it (adding the layers from the same URL) runs.
const parseBbox = (value: string): Bbox | undefined => {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }
  const [left, bottom, right, top] = parts;
  return { left, bottom, right, top };
};

const addLayers = async (
  layerList: {
    name: string;
    service: string;
    enabled: boolean;
    style: string;
    opacity: number;
    format: string;
  }[],
  mapId: string,
  dispatch: AppThunkDispatch,
) => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
  return new Promise<void>(async (resolve) => {
    for (const layer of layerList.reverse()) {
      await dispatch(
        thunks.addLayer({
          mapId,
          serviceUrl: layer.service,
          name: layer.name,
          enabled: layer.enabled,
          opacity: layer.opacity,
          styleName: layer.style,
        }),
      )
        .unwrap()
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn(e);
        });
    }

    resolve();
  });
};
export const handleWindowLocationQueryString = (
  mapId: string,
  dispatch: AppThunkDispatch,
) => {
  const lowerCaseUrlParams = new URLSearchParams(window.location.search);

  const srs = lowerCaseUrlParams.get('srs');
  const bbox = lowerCaseUrlParams.get('bbox');
  const parsedBbox = bbox && parseBbox(bbox);
  if (srs && parsedBbox) {
    dispatch(actions.requestSetProjection({ mapId, srs, bbox: parsedBbox }));
  }

  const baseLayerIds = parseBaseLayers(
    lowerCaseUrlParams.get('baselayers'),
    DEFAULT_BASE_LAYERS.map((baseLayer) => baseLayer.id),
  );
  if (baseLayerIds) {
    dispatch(actions.setEnabledBaseLayers({ ids: baseLayerIds }));
  }

  const services = lowerCaseUrlParams.get('service')?.split(',');
  const layers = lowerCaseUrlParams.get('layer')?.split(',');

  if (layers && services && layers.length > 0) {
    // A malformed entry is skipped rather than passed on as null, which
    // used to make addLayers throw and stop adding any of the others.
    // Which `layer` entry each added layer came from, in map order - the
    // layerdims/animate parameters refer to layers by that entry's
    // position, which a skipped entry shifts.
    const urlIndexes: number[] = [];
    const layerList = layers.flatMap((layer, urlIndex) => {
      const layerProps = layer?.split('$');
      if (layerProps && layerProps.length === 6) {
        const layerName = layerProps[0];
        const layerFormat = layerProps[1];
        const layerEnabled = layerProps[2] !== 'false';
        const layerStyle = layerProps[3];
        const parsedOpacity = parseFloat(layerProps[4]);
        // A missing/garbled value falls back to fully opaque, but a real
        // 0 stays 0.
        const layerOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 1;
        const layerServiceIndex = parseInt(`${layerProps[5]}`, 10);
        if (layerServiceIndex < services.length) {
          urlIndexes.push(urlIndex);
          return [
            {
              name: layerName,
              service: services[layerServiceIndex],
              enabled: layerEnabled,
              style: layerStyle,
              opacity: layerOpacity,
              format: layerFormat,
            },
          ];
        }
      }
      return [];
    });
    const toLayerIndex = (urlIndex: number): number | undefined => {
      const layerIndex = urlIndexes.indexOf(urlIndex);
      return layerIndex === -1 ? undefined : layerIndex;
    };
    void addLayers(layerList, mapId, dispatch).then(() => {
      const layerDimensions = parseLayerDimensions(
        lowerCaseUrlParams.get('layerdims'),
      );
      if (layerDimensions.length > 0) {
        // Every layer's own values first - nothing is linked yet at this
        // point, so each of these only changes its own layer.
        layerDimensions.forEach(({ layerIndex, name, value }) => {
          const mapLayerIndex = toLayerIndex(layerIndex);
          if (mapLayerIndex !== undefined) {
            dispatch(
              actions.changeLayerDimension({
                mapId,
                layerIndex: mapLayerIndex,
                dimensionName: name,
                dimensionValue: value,
              }),
            );
          }
        });
        layerDimensions
          .filter(({ linked }) => linked)
          .forEach(({ layerIndex, name }) => {
            const mapLayerIndex = toLayerIndex(layerIndex);
            if (mapLayerIndex !== undefined) {
              dispatch(
                actions.setLayerDimensionLinked({
                  mapId,
                  layerIndex: mapLayerIndex,
                  dimensionName: name,
                  linked: true,
                }),
              );
            }
          });
      } else {
        // An older permalink, without layerdims: its `dims` values, for the
        // first layer.
        const dims = lowerCaseUrlParams.get('dims')?.split(',');
        if (dims && dims.length > 0 && layerList.length > 0) {
          dims.forEach((dim) => {
            const time = dim.split('$');
            if (time && time.length === 2) {
              const dimensionName = time[0];
              const dimensionValue = time[1];
              dispatch(
                actions.changeLayerDimension({
                  mapId,
                  layerIndex: 0,
                  dimensionName,
                  dimensionValue,
                }),
              );
            }
          });
        }
      }

      const animation = parseAnimation(lowerCaseUrlParams.get('animate'));
      const animatedLayerIndex = animation
        ? toLayerIndex(animation.layerIndex)
        : undefined;
      if (animation && animatedLayerIndex !== undefined) {
        dispatch(
          actions.layerToggleAnimation({
            mapId,
            layerIndex: animatedLayerIndex,
            scope: animation.scope,
          }),
        );
      }
    });
  }
};

export const makePermaLink = (
  map: AdagucMap,
  // The Baselayers tab's base maps/overlays - left out of the link when not
  // given.
  baseLayers?: AdagucBaseLayer[],
): string => {
  if (!map) return '';
  // origin alone drops the path the app is actually served under - fine on
  // a site served from the domain root, but this app is also deployed as a
  // GitHub Pages *project* site (e.g. https://knmi.github.io/adaguc-data-
  // explorer/), where that path is the difference between a working
  // permalink and one that 404s at the bare domain root.
  const currentOrigin = window.location.origin + window.location.pathname;
  const { srs, bbox } = map.view;
  const projectionLink = `srs=${URLEncode(srs)}&bbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}`;
  const { layers } = map;
  const serviceMap = new Set<string>();
  layers.forEach((layer) => {
    serviceMap.add(layer.serviceUrl);
  });
  const serviceLink = `service=${URLEncode(Array.from(serviceMap).join(','))}`;
  const layersLink = layers
    .map((layer) => {
      const layerName = layer.name;
      const wmLayer = getWMLayer(layer.id);
      const layerFormat = wmLayer?.format || '';
      const layerEnabled = layer.enabled ? 'true' : 'false';
      const layerStyle = layer.style;
      const layerOpacity = layer.opacity;
      const layerServiceIndex = Array.from(serviceMap).findIndex(
        (item) => item === layer.serviceUrl,
      );
      return `${URLEncode(layerName)}$${URLEncode(layerFormat)}$${layerEnabled}$${URLEncode(layerStyle)}$${layerOpacity}$${layerServiceIndex}`;
    })
    .join(',');

  // Still written for older versions of the app, which apply `dims` to
  // the first layer only - so it holds the first layer's own values.
  const dimsLink = (layers[0]?.dimensions ?? [])
    .map((dim) => `${dim.name}$${dim.currentValue}`)
    .join(',');
  // Every layer's own values and link checkboxes, and a running animation
  // (see permalinkLayerState.ts) - what this version restores instead.
  const layerDimensions = formatLayerDimensions(layers);
  const animation = formatAnimation(map);
  const layerStateLink =
    (layerDimensions ? `&layerdims=${URLEncode(layerDimensions)}` : '') +
    (animation ? `&animate=${URLEncode(animation)}` : '') +
    (baseLayers
      ? `&baselayers=${URLEncode(formatBaseLayers(baseLayers))}`
      : '');
  return `${currentOrigin}?${projectionLink}&${serviceLink}&layer=${layersLink}&selected=0&dims=${dimsLink}${layerStateLink}`;
};
