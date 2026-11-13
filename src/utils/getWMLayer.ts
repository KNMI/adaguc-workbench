// The only place allowed to read opengeoweb's layer registry directly (see
// the no-restricted-imports rule in eslint.config.mjs).
// eslint-disable-next-line no-restricted-imports
import { WMLayer, getWMLayerById } from '@opengeoweb/webmap';

// Looks up the WMLayer opengeoweb keeps for a layer id.
//
// opengeoweb types getWMLayerById as always returning a WMLayer, but it
// returns undefined for an id it doesn't (or no longer) know - e.g. before a
// newly added layer has been registered, or after it was removed. Typing
// that honestly here lets strict mode check every caller.
//
// Keep in mind what the registry is for: it's a plain object, not React
// state - nothing re-renders when an entry changes, and webmap-react
// replaces an entry with a fresh WMLayer whenever it (re)creates a layer.
// Read capabilities from it (dimensions, styles, title, projections), but
// read anything the user controls (enabled, opacity, style, dimension
// values) from redux, which is what the map itself is drawn from.
export const getWMLayer = (layerId: string | undefined): WMLayer | undefined =>
  layerId === undefined ? undefined : (getWMLayerById(layerId) ?? undefined);
