import { useQuery } from '@tanstack/react-query';
import {
  LayerProps,
  queryWMSLayers,
  queryWMSServiceInfo,
} from '@opengeoweb/webmap';
import { makeGoodServiceLink } from '../../../utils/makeGoodServiceLink';

export interface AutoWMSItem {
  path: string;
  name: string;
  leaf: boolean;
  // The dataset's own ADAGUC WMS url, for a leaf.
  adaguc?: string;
}

interface AutoWMSResult {
  result: AutoWMSItem[];
}

export interface WMSServiceContents {
  layers: LayerProps[];
  abstract: string;
}

export const isWMSService = (service: string): boolean =>
  service?.toLocaleLowerCase().indexOf('service=wms') > 0 || false;

// Turns a failed request into a short, human-readable reason: a TypeError
// is what fetch() itself rejects with for a network-level failure (host
// unreachable, connection refused, DNS failure, CORS, ...), while anything
// else is a message raised here (e.g. a non-OK HTTP status) or an
// unexpected error from a dependency.
export const describeFetchError = (error: unknown): string =>
  error instanceof TypeError
    ? 'the service could not be reached'
    : (error as Error)?.message || 'an unexpected error occurred';

export const listingUrl = (service: string, path: string): string =>
  `${makeGoodServiceLink(service)}request=getfiles&path=${path}`;

export const capabilitiesUrl = (wmsService: string): string =>
  `${wmsService}SERVICE=WMS&REQUEST=GetCapabilities`;

// Shared by both queries: the app's QueryClient (wmsQueryClient) would
// otherwise retry a failed request 3 times and refetch on window focus -
// neither of which this panel ever did. A failure is shown right away.
const queryOptions = {
  retry: false,
  refetchOnWindowFocus: false,
} as const;

const EMPTY_LISTING: AutoWMSItem[] = [];

export const autoWMSListingKey = (service: string, path?: string) =>
  path === undefined
    ? ['autowms', 'listing', service]
    : ['autowms', 'listing', service, path];

// One folder of an AutoWMS explorer service. Keyed by service and path:
// navigating fetches the folder now shown, and a response for one that's
// no longer shown simply never reaches the screen.
export const useAutoWMSListing = (service: string, path: string) => {
  const enabled = !isWMSService(service) && service.length >= 4;
  const query = useQuery({
    queryKey: autoWMSListingKey(service, path),
    queryFn: async (): Promise<AutoWMSItem[]> => {
      try {
        const response = await fetch(listingUrl(service, path));
        if (!response.ok) {
          throw new Error(
            `server responded with ${response.status} ${response.statusText}`,
          );
        }
        const body = (await response.json()) as AutoWMSResult | undefined;
        return body?.result ?? EMPTY_LISTING;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        throw e;
      }
    },
    enabled,
    ...queryOptions,
  });
  return {
    items: enabled ? (query.data ?? EMPTY_LISTING) : EMPTY_LISTING,
    isFetching: enabled && query.isFetching,
    error:
      enabled && query.isError
        ? `Could not reach ${listingUrl(service, path)} - ${describeFetchError(query.error)}.`
        : null,
    refetch: () => {
      if (enabled) {
        void query.refetch();
      }
    },
  };
};

const EMPTY_CONTENTS: WMSServiceContents = { layers: [], abstract: '' };

export const wmsServiceKey = (wmsService: string) => [
  'autowms',
  'wms',
  wmsService,
];

// The layers (and description) of one OGC WMS service - a dataset picked
// in the explorer, or a WMS url entered directly. Keyed by its url, like
// the listing above.
export const useWMSServiceContents = (wmsService: string) => {
  const enabled = wmsService.length > 0;
  const query = useQuery({
    queryKey: wmsServiceKey(wmsService),
    queryFn: async (): Promise<WMSServiceContents> => {
      try {
        const url = capabilitiesUrl(wmsService);
        const [layers, serviceInfo] = await Promise.all([
          queryWMSLayers(url, true),
          queryWMSServiceInfo(url),
        ]);
        return { layers, abstract: serviceInfo.abstract };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        throw e;
      }
    },
    enabled,
    ...queryOptions,
  });
  return {
    contents: enabled ? (query.data ?? EMPTY_CONTENTS) : EMPTY_CONTENTS,
    isFetching: enabled && query.isFetching,
    error:
      enabled && query.isError
        ? `Could not reach ${wmsService} - ${describeFetchError(query.error)}.`
        : null,
    refetch: () => {
      if (enabled) {
        void query.refetch();
      }
    },
  };
};
