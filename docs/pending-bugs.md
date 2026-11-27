# Pending bugs to verify

Bugs found while working on Adaguc Workbench that still need checking: in the
opengeoweb packages (which this app works around), on the ADAGUC server side,
and in this app where only automated tests have covered a change so far.
Found with `@opengeoweb/webmap` and `@opengeoweb/webmap-react` 21.2.0, and
checked again against 21.3.0 (the version this app now uses).

For each opengeoweb bug: confirm it still happens in the latest version, file
it, and once it's fixed upstream, remove the workaround named under it.

## opengeoweb

### 1. `setViewFromExtent` ignores a bbox whose left edge is 0 - fixed in 21.3.0

`@opengeoweb/webmap-react`. It starts with
`if (!bbox || !Number(bbox.left) || ...)`, and `!Number(0)` is true, so a valid
bbox with its left edge at exactly 0 counts as no bbox at all: the map is
centred on [0, 0] at zoom level 1 instead of fitting the bbox.

To reproduce: the "Netherlands - RD NEW" predefined area (EPSG:28992,
`left: 0`) shows the whole world instead of the Netherlands.

Suggested fix: check that all four edges are finite numbers
(`Number.isFinite`) instead of truthy.

- [x] Fixed upstream in `@opengeoweb/webmap-react` 21.3.0: it now checks the
      four edges with `Number.isFinite`, as suggested
- [x] `src/utils/fitViewToBbox.ts` replaced with `setViewFromExtent` again

### 2. `getWMLayerById` is typed as always returning a `WMLayer`

`@opengeoweb/webmap`. Declared as `(layerId: string) => WMLayer`, but it's a
plain lookup that returns `undefined` for a layer that isn't registered (yet,
or any more). TypeScript then doesn't make callers handle that case, and
calling a method on the result crashes at runtime.

Suggested fix: declare the return type as `WMLayer | undefined`.

- [x] Still happens in the latest opengeoweb (21.3.0)
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

- [x] Still happens in the latest opengeoweb (21.3.0)
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

- [x] Still happens in the latest opengeoweb (21.3.0)
- [ ] Filed upstream
- [ ] Fixed upstream - then `refreshLayerCapabilities` in
      `src/connectedcomponents/useLayerAutoUpdate.ts` can go back to just
      `parseLayer(true)`

### 5. Changing a layer's reference time doesn't update its time steps

`@opengeoweb/webmap-react`. For a layer with a `reference_time` (model run)
dimension, `WMLayer.handleReferenceTime` limits the time dimension to the
chosen run's steps: from the reference time on, for as long as a run lasts
(the advertised end minus the newest reference time), as adaguc-viewer did.
But webmap-react applies this only once, when it first sets a layer up.
After that it passes a changed `reference_time` layer prop to the WMLayer
with the dimension's own `setValue`, which skips `handleReferenceTime`
(`WMLayer.setDimension` would call it). So the time slider keeps the first
run's steps, and a time outside the newly chosen run is still requested.

Two related details:

- When first setting the layer up, the run is picked as the reference time
  closest to the layer's *time* value (`refTimeDim.getClosestValue(wmTimeDim.getValue(), true)`),
  not the `reference_time` it was given.
- Applying a run overwrites the time dimension's `defaultValue` with the
  run's last step, so the server's advertised default is lost (see also 4).

To reproduce: add `drn-uwcw-gusts` from
`https://adaguc-server-geoweb-staging.geoweb.acc.knmi.cloud/adagucserver?dataset=DRNGUSTS&`
and step its `reference_time` back a few runs. Without the workaround, the
time slider's range doesn't move.

Suggested fix: whenever the `reference_time` prop changes, call
`handleReferenceTime` (or pass the value through `WMLayer.setDimension`) with
the layer's own `reference_time`, keep the time value within the new run's
steps (its closest value), and let the app know the time steps changed. They
change outside React, so the time slider doesn't redraw for them by itself.

- [x] Still happens in the latest opengeoweb (21.3.0)
- [ ] Filed upstream
- [ ] Fixed upstream - then `src/connectedcomponents/useReferenceTimeSteps.ts`,
      the layer's `timeStepsFor` field and the `fromReferenceTime` flag of
      `changeLayerDimension` can go

### Improvement (not a bug): load GeoTIFF support on demand

`@opengeoweb/webmap-react` imports OpenLayers' GeoTIFF source, and with it
the `geotiff` library, up front: about 300 kB (~85 kB gzipped) of this app's
bundle, although the app has no GeoTIFF layers.

- [ ] Proposed upstream (still loaded up front in 21.3.0)

## ADAGUC server

### `liveupdate` capabilities look cached

Two GetCapabilities requests for
`https://geoservices.knmi.nl/adagucserver?dataset=liveupdate&` made 11 seconds
apart returned the same `default` time for `live_update_every_second`, which
is meant to change every second. Auto-update can only follow the default as
often as the server (or a cache in front of it) changes it.

- [ ] Find out how long the capabilities are cached, and whether that is
      intended

### Model runs whose first step comes after their reference time

For a layer with a `reference_time`, the WMS capabilities have one `time`
and one `reference_time` dimension, and WMS has no way to say which times
belong to which run. The `time` range covers all runs together (e.g.
`DRNGUSTS`: 10 Nov 14:00 to 19 Nov 21:00). So viewers (opengeoweb's
`handleReferenceTime`, and adaguc-viewer before it) have to assume each run
starts at its reference time. `DRNGUSTS` runs start an hour later: asking for
the reference time itself returns `InvalidDimensionValue: Store has no
results`, while an hour later works. The first step of every run is offered
but has no data.

This can't be fixed in the WMS capabilities. Possible ways out:

- Accept it as a known limitation: the empty first step is only an error
  image, and the next step works.
- An ADAGUC-specific request, next to WMS, that returns the times of one run,
  for the viewer to use after a change of reference time.
- OGC API EDR, which can describe each model run as an instance with its own
  temporal extent. Worth checking whether ADAGUC's EDR interface already
  offers this for these datasets.

- [ ] Decide with the ADAGUC server maintainers whether this is worth
      solving, and how

## This app: not yet checked by hand

Covered by automated tests, but not yet looked at in a browser.

- [ ] The time slider's tooltip shows the selected time in local time and UTC
- [ ] The auto-update countdown pie reads well in the Dark and Classic themes
