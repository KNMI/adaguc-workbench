import * as React from 'react';
import { useQueries } from '@tanstack/react-query';
import { MapLocation } from '@opengeoweb/webmap-react';
import { useAppSelector } from '../../../store/store';
import { selectors } from '../../../store/selectors';
import { AdagucLayer, ViewerState } from '../../../store/types';
import { getFeatureInfoUrl } from '../../../utils/getFeatureInfoUrl';
import sanitizeHTML from '../../../utils/sanitizeHTML';
import {
  QueryLayerItem,
  RequestLink,
  SubPanelProps,
  fetchText,
  queryPanelQueryOptions,
  safeUrl,
} from './queryShared';

const fetchFeatureInfo = async (url: string): Promise<string> => {
  try {
    return (await fetchText(url)).text;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    throw e;
  }
};

const GetFeatureInfoPanel = ({
  mapId,
  isShown,
}: SubPanelProps): React.ReactElement | null => {
  const layers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const mapPinLocation = useAppSelector(
    (state: ViewerState): MapLocation | undefined =>
      state?.viewer?.maps[mapId]?.mapPinLocation,
  );
  const enabledLayers = layers.filter((layer) => layer.enabled);

  // Keyed by the request url, so moving the pin (or changing whatever the
  // url includes, e.g. the layer's time) fetches anew, while an unchanged
  // request is never fetched twice. Runs even while another subtab is
  // shown: GetFeatureInfo and TimeSeries share the map-click pin, and
  // fetching both right away keeps either ready to switch to.
  const urls = enabledLayers.map((layer) =>
    mapPinLocation
      ? safeUrl(() => getFeatureInfoUrl(layer, mapPinLocation))
      : undefined,
  );
  const results = useQueries({
    queries: urls.map((url) => ({
      queryKey: ['query-panel', 'getFeatureInfo', url],
      queryFn: () => fetchFeatureInfo(url ?? ''),
      enabled: !!url,
      ...queryPanelQueryOptions,
    })),
  });

  if (!isShown) {
    return null;
  }
  return (
    <>
      {enabledLayers.map((layer, index) => (
        <QueryLayerItem
          key={layer.id}
          layer={layer}
          subTab="GetFeatureInfo"
          caption={<RequestLink url={urls[index]} />}
        >
          <div
            className="getfeatureinfo_result_contents"
            dangerouslySetInnerHTML={sanitizeHTML(results[index].data || '--')}
          />
        </QueryLayerItem>
      ))}
    </>
  );
};

export default GetFeatureInfoPanel;
