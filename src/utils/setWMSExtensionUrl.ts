import { WMLayer } from '@opengeoweb/webmap';
import { refreshLayerSource } from './refreshLayerSource';

// Sets the extra query parameters a layer adds to its GetMap requests (e.g.
// "&COLORSCALERANGE=0,10"; '' for none) and re-fetches its image. WMLayer is
// opengeoweb's own mutable layer object - updating it in place is how its
// API works - so this lives outside React components, which must not
// mutate their props.
export const setWMSExtensionUrl = (wmLayer: WMLayer, url: string): void => {
  // eslint-disable-next-line no-param-reassign
  wmLayer.wmsextensions.url = url;
  refreshLayerSource(wmLayer);
};
