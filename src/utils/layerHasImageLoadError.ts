import { WMImageStore, WMLayer } from '@opengeoweb/webmap';

type LayerEndpoint = { getmapURL: string; name: string };

// Checks whether a given GetMap image request url belongs to this layer -
// the image store isn't keyed by layer id, only by request url, so this is
// how any image is attributed back to a specific layer.
export const imageSrcBelongsToLayer = (
  src: string,
  wmLayer: Pick<WMLayer, 'getmapURL' | 'name'> | undefined,
): wmLayer is LayerEndpoint => {
  if (!wmLayer?.getmapURL || !wmLayer?.name) {
    return false;
  }
  try {
    const endpoint = new URL(wmLayer.getmapURL);
    const srcUrl = new URL(src);
    return (
      srcUrl.origin === endpoint.origin &&
      srcUrl.pathname === endpoint.pathname &&
      srcUrl.searchParams.get('LAYERS') === wmLayer.name
    );
  } catch {
    return false;
  }
};

// Snapshot check for whether *any* currently cached image for this layer
// has an error - good enough as a one-off initial value (e.g. on mount),
// but not for tracking the error state over time: the store never removes
// an entry just because a later request for the same layer succeeded, so
// an old bbox/time combination that failed while the server was down
// would keep matching here forever, even once the server is back up and
// new requests are succeeding. Live updates should instead come from the
// store's own load-completion events - see
// addImageEventCallback/removeEventCallback on WMImageStore, which fire
// in true chronological order of real network activity rather than
// relying on a heuristic snapshot like this one.
export const layerHasImageLoadError = (
  imageStore: Pick<WMImageStore, 'imagesbysrc'>,
  wmLayer: Pick<WMLayer, 'getmapURL' | 'name'> | undefined,
): boolean => {
  let anyMatchHasError = false;
  imageStore.imagesbysrc.forEach((image, src) => {
    if (imageSrcBelongsToLayer(src, wmLayer) && image.hasError()) {
      anyMatchHasError = true;
    }
  });
  return anyMatchHasError;
};
