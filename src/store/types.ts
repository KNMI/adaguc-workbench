import { Bbox, LayerProps, LayerType } from '@opengeoweb/webmap';
import { MapLocation } from '@opengeoweb/webmap-react';

export interface AdagucLayerDimension {
  name: string;
  currentValue: string;
  // When true, changing this dimension on any layer (see
  // reducers.changeLayerDimension) also updates this one to match - lets
  // e.g. several layers' own time sliders be "linked" into one sync group.
  linked?: boolean;
}
export interface AdagucLayer {
  name: string;
  serviceUrl: string;
  id: string;
  style: string;
  dimensions: AdagucLayerDimension[];
  enabled: boolean;
  opacity: number;
  // Flips to true once the layer's WMS capabilities have been parsed (see
  // the initializeLayer reducer). Exists purely so that, unlike dimensions
  // or style, this is guaranteed to be a real value change the first time
  // it happens — selectors here use a deep-equality result check, so
  // dispatching data that happens to already match redux's current value
  // (the common case, since the add-layer thunk already parses once) would
  // otherwise never cause the layer panel to re-render and pick up the
  // live WMLayer instance (title, dimension ranges) it reads separately.
  isReady?: boolean;
  // True when the add-layer flow couldn't fully resolve this layer (e.g.
  // the service was unreachable, or doesn't have a layer by this name) -
  // see thunks.addLayer. The layer is still added, just with no dimensions.
  hasError?: boolean;
}

export interface AdagucService {
  id: string;
  serviceUrl: string;
  layers: LayerProps[];
}

export interface AdagucMapView {
  srs: string;
  bbox: Bbox;
}

export interface AdagucViewCommand {
  srs: string;
  bbox: Bbox;
  requestId: number;
}

export interface AdagucZoomToLayerCommand {
  layerId: string;
  requestId: number;
}

export interface AdagucHistogramBox {
  bbox: Bbox;
  srs: string;
  // The box's own on-screen size as dragged, in device pixels - passed
  // through as the GetHistoGram request's WIDTH/HEIGHT (sampling density),
  // matching adaguc-viewer's legacy histogram tool rather than a fixed grid.
  pixelWidth: number;
  pixelHeight: number;
}

export interface AdagucMap {
  isAnimating: boolean;
  layers: AdagucLayer[];
  view: AdagucMapView;
  viewCommand?: AdagucViewCommand;
  zoomToLayerCommand?: AdagucZoomToLayerCommand;
  isGetFeatureInfoActive: boolean;
  mapPinLocation?: MapLocation;
  isHistogramBoxSelectActive: boolean;
  histogramBox?: AdagucHistogramBox;
}
export interface AdagucAutoWMSServiceCommand {
  service: string;
  requestId: number;
}

// A predefined entry in the Baselayers tab (see BaseLayersPanel) - ported
// from adaguc-viewer's own baseLayerConfiguration list of selectable base
// maps/overlays. Unlike AdagucLayer, these aren't added/removed by the
// user - the list itself is fixed, only `enabled` is ever toggled.
export interface AdagucBaseLayer {
  id: string;
  name: string;
  title: string;
  layerType: LayerType.baseLayer | LayerType.overLayer;
  enabled: boolean;
  type?: string;
  format?: string;
  service?: string;
}

export interface AdagucMapsState {
  maps: Record<string, AdagucMap>;
  services: Record<string, AdagucService>;
  // Not tied to a specific map: the AutoWMS panel is a single, global tool
  // (see SideToolPanel) - set when the top bar's "custom WMS service" field
  // is given a URL that looks like an AutoWMS explorer endpoint rather than
  // a plain OGC WMS GetCapabilities url, so it opens there instead of being
  // added as a map layer.
  autoWMSServiceCommand?: AdagucAutoWMSServiceCommand;
  // Also not tied to a specific map, for the same reason as above - this
  // app only ever has the one map.
  baseLayers: AdagucBaseLayer[];
  // The requestId handed out to the most recent view / zoom-to-layer /
  // AutoWMS command. Kept here rather than in a module-level variable so
  // reducers stay pure: each store (and each test) has its own count.
  lastCommandRequestId?: number;
}

export interface ViewerState {
  viewer: AdagucMapsState;
}
