# Pending bugs to verify

Bugs found while working on Adaguc Workbench that still need checking: in the
opengeoweb packages (which this app works around), on the ADAGUC server side,
and in this app where only automated tests have covered a change so far.
Checked against `@opengeoweb/webmap` and `@opengeoweb/webmap-react` 21.2.0.

For each opengeoweb bug: confirm it still happens in the latest version, file
it, and once it's fixed upstream, remove the workaround named under it.

## opengeoweb

### 1. `setViewFromExtent` ignores a bbox whose left edge is 0

`@opengeoweb/webmap-react`. It starts with
`if (!bbox || !Number(bbox.left) || ...)`, and `!Number(0)` is true, so a valid
bbox with its left edge at exactly 0 counts as no bbox at all: the map is
centred on [0, 0] at zoom level 1 instead of fitting the bbox.

To reproduce: the "Netherlands - RD NEW" predefined area (EPSG:28992,
`left: 0`) shows the whole world instead of the Netherlands.

Suggested fix: check that all four edges are finite numbers
(`Number.isFinite`) instead of truthy.

- [ ] Still happens in the latest opengeoweb
- [ ] Filed upstream
- [ ] Fixed upstream - then replace `src/utils/fitViewToBbox.ts` with
      `setViewFromExtent` again

### 2. `getWMLayerById` is typed as always returning a `WMLayer`

`@opengeoweb/webmap`. Declared as `(layerId: string) => WMLayer`, but it's a
plain lookup that returns `undefined` for a layer that isn't registered (yet,
or any more). TypeScript then doesn't make callers handle that case, and
calling a method on the result crashes at runtime.

Suggested fix: declare the return type as `WMLayer | undefined`.

- [ ] Still happens in the latest opengeoweb
- [ ] Filed upstream
- [ ] Fixed upstream - then `src/utils/getWMLayer.ts` and the
      `no-restricted-imports` rule for `getWMLayerById` in
      `eslint.config.mjs` can go

### 3. WMS 1.3.0 GetMap puts the BBOX north-first only for EPSG:4326

`@opengeoweb/webmap`, WMLayer's GetMap URL:
`swapBBOX = version === 1.3.0 && srs === EPSG:4326 && !wms130bboxcompatibilitymode`.
Under WMS 1.3.0 the axis order comes from the CRS, and other CRSs are
latitude/northing first too, such as EPSG:4258 (ETRS89) and EPSG:32661
(UPS North). For those the BBOX goes out east-first, and ADAGUC returns the
wrong area or an error.

This app avoids it for map images with the `+axis=neu` definitions in
`src/utils/projections.ts`: OpenLayers then swaps the BBOX itself. Anything
that uses WMLayer's own GetMap URL still sends it east-first.

Suggested fix: take the axis order from the projection definition rather
than comparing with EPSG:4326 only.

- [ ] Still happens in the latest opengeoweb
- [ ] Filed upstream
- [ ] Fixed upstream - then check whether the `+axis=neu` definitions are
      still needed

### 4. Re-parsing capabilities doesn't update a dimension's default

`@opengeoweb/webmap`, `addDimsForLayer`. For a dimension the layer already
has, `WMLayer.parseLayer(true)` updates its values from the newly fetched
capabilities, but keeps the `defaultValue` it was first given. A layer whose
server advertises a new `default` time keeps the old one.

To reproduce: add `live_update_every_second` from
`https://geoservices.knmi.nl/adagucserver?dataset=liveupdate&` and switch on
auto-update. The capabilities are fetched every 20 seconds, but without the
workaround the time never moves.

Suggested fix: also set `defaultValue` (resolving `current`) when updating
an existing dimension.

- [ ] Still happens in the latest opengeoweb
- [ ] Filed upstream
- [ ] Fixed upstream - then `refreshLayerCapabilities` in
      `src/connectedcomponents/useLayerAutoUpdate.ts` can go back to just
      `parseLayer(true)`

### Improvement (not a bug): load GeoTIFF support on demand

`@opengeoweb/webmap-react` imports OpenLayers' GeoTIFF source, and with it
the `geotiff` library, up front: about 300 kB (~85 kB gzipped) of this app's
bundle, although the app has no GeoTIFF layers.

- [ ] Proposed upstream

## ADAGUC server

### `liveupdate` capabilities look cached

Two GetCapabilities requests for
`https://geoservices.knmi.nl/adagucserver?dataset=liveupdate&` made 11 seconds
apart returned the same `default` time for `live_update_every_second`, which
is meant to change every second. Auto-update can only follow the default as
often as the server (or a cache in front of it) changes it.

- [ ] Find out how long the capabilities are cached, and whether that is
      intended

## This app: not yet checked by hand

Covered by automated tests, but not yet looked at in a browser.

- [ ] The time slider's tooltip shows the selected time in local time and UTC
- [ ] The auto-update countdown pie reads well in the Dark and Classic themes
