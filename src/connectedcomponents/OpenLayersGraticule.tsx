import * as React from 'react';
import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { unByKey } from 'ol/Observable';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { MapContext } from '@opengeoweb/webmap-react';
import { buildGraticule, GraticuleLabel, LabelEdge } from '../utils/graticule';

export interface OpenLayersGraticuleProps {
  zIndex: number;
}

// Drawn on the map's canvas, so in fixed colours rather than the theme's:
// a blue-grey that shows on the light and the dark base maps alike, with a
// light edge around the labels to keep them readable over data.
const LINE_COLOR = 'rgba(40, 70, 110, 0.6)';
const LINE_EDGE_COLOR = 'rgba(255, 255, 255, 0.35)';
const LABEL_COLOR = 'rgb(25, 45, 75)';
const LABEL_EDGE_COLOR = 'rgba(255, 255, 255, 0.9)';
const LABEL_FONT = '11px "Roboto", "Helvetica", "Arial", sans-serif';
// Pixels between a label and the edge of the map it sits at.
const LABEL_MARGIN = 4;

// A faint light line under each dark one: on a dark base map (satellite
// imagery) it is that one that shows.
const lineStyle = [
  new Style({ stroke: new Stroke({ color: LINE_EDGE_COLOR, width: 3 }) }),
  new Style({ stroke: new Stroke({ color: LINE_COLOR, width: 1 }) }),
];

// Text drawn inward from the edge of the map the label sits at.
const LABEL_PLACEMENT: Record<
  LabelEdge,
  {
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    offsetX: number;
    offsetY: number;
  }
> = {
  top: {
    textAlign: 'center',
    textBaseline: 'top',
    offsetX: 0,
    offsetY: LABEL_MARGIN,
  },
  bottom: {
    textAlign: 'center',
    textBaseline: 'bottom',
    offsetX: 0,
    offsetY: -LABEL_MARGIN,
  },
  left: {
    textAlign: 'left',
    textBaseline: 'middle',
    offsetX: LABEL_MARGIN,
    offsetY: 0,
  },
  right: {
    textAlign: 'right',
    textBaseline: 'middle',
    offsetX: -LABEL_MARGIN,
    offsetY: 0,
  },
  none: { textAlign: 'center', textBaseline: 'middle', offsetX: 0, offsetY: 0 },
};

const labelStyle = (label: GraticuleLabel): Style =>
  new Style({
    text: new Text({
      text: label.text,
      font: LABEL_FONT,
      fill: new Fill({ color: LABEL_COLOR }),
      stroke: new Stroke({ color: LABEL_EDGE_COLOR, width: 3 }),
      ...LABEL_PLACEMENT[label.edge],
    }),
  });

// The latitude/longitude lines as map features, in the view's projection.
export const graticuleFeatures = (extent: number[], srs: string): Feature[] => {
  const graticule = buildGraticule(extent, srs);
  if (!graticule) {
    return [];
  }
  const features: Feature[] = [];
  graticule.lines.forEach((line) => {
    const lineFeature = new Feature(new MultiLineString(line.pieces));
    lineFeature.setStyle(lineStyle);
    features.push(lineFeature);
    if (line.label) {
      const labelFeature = new Feature(new Point(line.label.coordinate));
      labelFeature.setStyle(labelStyle(line.label));
      features.push(labelFeature);
    }
  });
  return features;
};

// Latitude/longitude lines over the map, drawn in the browser - unlike the
// other overlays, which are images from a server. That is what lets the
// lines follow the view: about ten meridians and ten parallels at any zoom
// level, each labelled where it leaves the map (see utils/graticule).
const OpenLayersGraticule = ({ zIndex }: OpenLayersGraticuleProps): null => {
  const { map } = React.useContext(MapContext);

  React.useEffect(() => {
    if (!map) {
      return undefined;
    }
    const source = new VectorSource();
    const layer = new VectorLayer({
      source,
      zIndex,
      // Leaves out a label that would overlap another one.
      declutter: true,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    map.addLayer(layer);

    // The lines belong to one view of the map: redrawn whenever what the
    // map shows has changed - a pan, a zoom, a resize or another
    // projection. Checked after each rendering of the map, which is what
    // all of those lead to (changing the lines renders the map once more,
    // by then showing the same view - which ends it).
    let drawnFor = '';
    const update = (): void => {
      const size = map.getSize();
      const view = map.getView();
      if (!size || !view.isDef()) {
        return;
      }
      const extent = view.calculateExtent(size);
      const srs = view.getProjection().getCode();
      const current = `${srs} ${extent.join(' ')}`;
      if (current === drawnFor) {
        return;
      }
      drawnFor = current;
      source.clear(true);
      source.addFeatures(graticuleFeatures(extent, srs));
    };
    const listenerKey = map.on('postrender', update);
    update();

    return (): void => {
      unByKey(listenerKey);
      map.removeLayer(layer);
    };
  }, [map, zIndex]);

  return null;
};

export default OpenLayersGraticule;
