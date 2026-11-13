import * as React from 'react';
import { ThemeWrapper } from '@opengeoweb/theme';
import { appTheme } from '../application/appTheme';

import { actions, useAppDispatch, useAppSelector } from '../store/store';
import { MAP_ID } from '../store/mapId';
import { selectors } from '../store/selectors';
import { AdagucLayer, ViewerState } from '../store/types';
import { ReduxMapViewComponent } from './ReduxMapViewComponent';
import 'react-mosaic-component/react-mosaic-component.css';
import '../assets/styles.css';
import LayerPanel from './LayerPanel';
import AdagucAppBar from './AdagucAppBar';
import { handleWindowLocationQueryString } from './handleWindowLocationQueryString';
import { handleAddLayerHash } from './handleAddLayerHashTag';
import { AdagucMosaic } from './AdagucMosaic';
import SideToolPanel from './SideTools/SideToolPanel';

const ReduxMap = (): React.ReactElement => {
  const dispatch = useAppDispatch();
  const mapId = MAP_ID;

  // In the store (rather than local state) so a permalink can carry them.
  const layerPanelIsExpanded = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.layerPanelIsExpanded ?? true,
  );
  const toolsPanelIsExpanded = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.toolsPanelIsExpanded ?? true,
  );
  const setLayerPanelIsExpanded = React.useCallback(
    (expanded: boolean) => {
      dispatch(actions.setPanelExpanded({ panel: 'layers', expanded }));
    },
    [dispatch],
  );
  const toggleExpandToolsPanel = React.useCallback(
    (expanded: boolean) => {
      dispatch(actions.setPanelExpanded({ panel: 'tools', expanded }));
    },
    [dispatch],
  );

  // handleAddLayerHash needs the layers currently on the map (to dedupe
  // against) every time the hash changes, not just once on mount - a ref
  // lets the 'hashchange' listener below always read the latest list
  // without having to tear down and resubscribe it whenever layers change.
  const mapLayers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const mapLayersRef = React.useRef(mapLayers);
  React.useEffect(() => {
    mapLayersRef.current = mapLayers;
  }, [mapLayers]);

  // Set first layer as default
  React.useEffect(() => {
    // On a fresh load, maps[mapId] doesn't exist yet - it's otherwise only
    // ever created as a side effect of a layer finishing being added - so
    // without this, removeAllLayers and the srs/bbox from the URL (both
    // dispatched synchronously below, before any layer has been added) are
    // silently dropped by reducers that bail out when the map isn't there.
    dispatch(actions.registerMap({ mapId }));
    dispatch(actions.removeAllLayers({ mapId }));
    handleWindowLocationQueryString(mapId, dispatch);
    // Handles a #addlayer(...) hash already present when the page itself
    // first loads - the listener below only covers it changing afterwards.
    handleAddLayerHash(mapId, dispatch, mapLayersRef.current);
    // Both are stable (the store's dispatch, and a constant map id), so
    // this still only runs once, on mount.
  }, [dispatch, mapId]);

  // Picks up a #addlayer('<service>','<name>') hash set on this already-
  // open tab (e.g. from another script/bookmarklet), live - setting
  // location.hash alone never reloads the page, so nothing else here
  // would otherwise notice it changed.
  React.useEffect(() => {
    const onHashChange = (): void => {
      handleAddLayerHash(mapId, dispatch, mapLayersRef.current);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [mapId, dispatch]);

  // Memoized so that re-rendering this component (e.g. because mapLayers
  // changed) doesn't also re-render every panel - each of them reads what
  // it needs from the store itself.
  const mosaicItems = React.useMemo(
    (): { [viewId: string]: React.ReactElement } => ({
      b: (
        <div>
          <LayerPanel
            mapId={mapId}
            isExpanded={layerPanelIsExpanded}
            onToggleExpanded={setLayerPanelIsExpanded}
          />
        </div>
      ),
      c: (
        <div>
          <ReduxMapViewComponent mapId={mapId} />
        </div>
      ),
      d: (
        <div>
          <SideToolPanel
            toolsPanelIsExpanded={toolsPanelIsExpanded}
            toggleExpandToolsPanel={toggleExpandToolsPanel}
          />
        </div>
      ),
    }),
    [
      mapId,
      layerPanelIsExpanded,
      toolsPanelIsExpanded,
      setLayerPanelIsExpanded,
      toggleExpandToolsPanel,
    ],
  );

  return (
    <ThemeWrapper theme={appTheme}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexFlow: 'column wrap',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* No explicit height here: the toolbar's own minHeight (see
            AdagucAppBar) is the only source of truth for the header's
            height. Pinning this wrapper to a separate fixed height too
            left a gap below the AppBar whenever the two didn't match
            exactly, showing the theme's grey body background through it
            as a thin bar. */}
        <div>
          <AdagucAppBar />
        </div>
        <div style={{ flex: 1 }}>
          <AdagucMosaic
            mosaicItems={mosaicItems}
            layerPanelIsExpanded={layerPanelIsExpanded}
            toolsPanelIsExpanded={toolsPanelIsExpanded}
          />
        </div>
      </div>
    </ThemeWrapper>
  );
};

export default ReduxMap;
