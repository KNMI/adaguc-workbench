import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { projections } from './projections';

// OpenLayers can't build a View for an srs it has no proj4 definition for -
// `ol/proj`.get(srs) returns null for it, and View construction then throws
// "Cannot read properties of null (reading 'getExtent')". Registers the
// definitions from ./projections that @opengeoweb/webmap-react doesn't
// already provide, so the map can actually switch to those srs's.
let registered = false;

// eslint-disable-next-line import/prefer-default-export
export const registerExtraProjections = (): void => {
  if (registered) {
    return;
  }
  registered = true;
  Object.entries(projections).forEach(([code, { proj4: definition }]) => {
    if (definition) {
      proj4.defs(code, definition);
    }
  });
  register(proj4);
};
