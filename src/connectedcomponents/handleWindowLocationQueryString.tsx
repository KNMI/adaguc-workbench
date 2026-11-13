import { Bbox, getWMLayerById } from '@opengeoweb/webmap';
import { AppThunkDispatch, actions } from '../store/store';
import { thunks } from '../store/thunks';
import { AdagucMap } from '../store/types';

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
    // eslint-disable-next-line no-restricted-syntax
    for (const layer of layerList.reverse()) {
      // eslint-disable-next-line no-await-in-loop
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

  const services = lowerCaseUrlParams.get('service')?.split(',');
  const layers = lowerCaseUrlParams.get('layer')?.split(',');

  if (layers && services && layers.length > 0) {
    const layerList = layers.map((layer) => {
      const layerProps = layer?.split('$');
      if (layerProps && layerProps.length === 6) {
        const layerName = layerProps[0];
        const layerFormat = layerProps[1];
        const layerEnabled = layerProps[2] !== 'false';
        const layerStyle = layerProps[3];
        const layerOpacity = parseFloat(layerProps[4]);
        const layerServiceIndex = parseInt(`${layerProps[5]}`, 10);
        if (layerServiceIndex < services.length) {
          return {
            name: layerName,
            service: services[layerServiceIndex],
            enabled: layerEnabled,
            style: layerStyle,
            opacity: layerOpacity,
            format: layerFormat,
          };
        }
      }
      return null;
    });
    // eslint-disable-next-line no-void
    void addLayers(layerList, mapId, dispatch).then(() => {
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
    });
  }
};

export const makePermaLink = (map: AdagucMap): string => {
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
      const wmLayer = getWMLayerById(layer.id);
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

  const dimsMap = new Map<string, string>();
  layers.forEach((layer) => {
    layer.dimensions.forEach((dim) => {
      dimsMap.set(dim.name, dim.currentValue);
    });
  });
  const dimsLink = Array.from(dimsMap.entries())
    .map(([name, currentValue]) => `${name}$${currentValue}`)
    .join(',');
  return `${currentOrigin}?${projectionLink}&${serviceLink}&layer=${layersLink}&selected=0&dims=${dimsLink}`;
};
