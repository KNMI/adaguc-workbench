import { LayerType, generateLayerId } from '@opengeoweb/webmap';

// eslint-disable-next-line import/prefer-default-export
export const baseLayerWorldMap = {
  name: 'WorldMap',
  title: 'WorldMap',
  type: 'twms',
  layerType: LayerType.baseLayer,
  enabled: true,
  id: generateLayerId(),
  zIndex: 0,
};
