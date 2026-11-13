// The id of the app's one and only map. The store supports several maps
// (state.viewer.maps is keyed by id), but the UI only ever shows this one.
// Kept out of store.ts on purpose: many tests mock that module wholesale,
// which would leave this constant undefined there.
export const MAP_ID = 'map1';
