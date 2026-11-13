import * as React from 'react';
import { Typography } from '@mui/material';
import { AdagucLayer } from '../../../store/types';
import { extractServiceErrorMessage } from '../../../utils/extractServiceErrorMessage';

export type SubTab = 'GetFeatureInfo' | 'TimeSeries' | 'Histogram';

export interface SubPanelProps {
  mapId: string;
  // Each sub-panel stays mounted, so its state and its fetches carry on,
  // while another subtab is shown - it just renders nothing then.
  isShown: boolean;
}

// Shared by every query in this panel. The app's QueryClient
// (wmsQueryClient) would otherwise retry a failed request 3 times and
// refetch on window focus - neither of which this panel ever did; a failed
// request is reported right away instead (TimeSeries does its own, single,
// smarter retry - see TimeSeriesPanel).
export const queryPanelQueryOptions = {
  retry: false,
  refetchOnWindowFocus: false,
} as const;

// A request that reached the server but was refused by it (a non-2xx
// status): `message` is the server's own explanation, when it gave one.
export class ServiceError extends Error {}

export const fetchText = async (
  url: string,
): Promise<{ ok: boolean; text: string }> => {
  const response = await fetch(url);
  return { ok: response.ok, text: await response.text() };
};

// Parses one response, turning a refused request into a ServiceError
// carrying the server's own message - a failed request responds with an
// OGC <ServiceExceptionReport> body instead of the requested JSON.
export const parseServiceResponse = <T,>(
  response: { ok: boolean; text: string },
  parse: (json: unknown) => T | null | undefined,
): T => {
  if (!response.ok) {
    throw new ServiceError(extractServiceErrorMessage(response.text));
  }
  const result = parse(JSON.parse(response.text));
  if (!result) {
    throw new ServiceError('');
  }
  return result;
};

// Anything going wrong other than the server refusing the request
// (network, unparsable data) is logged, and reported as a ServiceError
// without a message.
export const reportUnexpectedErrors = async <T,>(
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ServiceError) {
      throw e;
    }
    // eslint-disable-next-line no-console
    console.error(e);
    throw new ServiceError('');
  }
};

export const fetchParsed = <T,>(
  url: string,
  parse: (json: unknown) => T | null | undefined,
): Promise<T> =>
  reportUnexpectedErrors(async () =>
    parseServiceResponse(await fetchText(url), parse),
  );

// A request url builder that can throw (getMapDimURL does, for a
// dimension value outside the layer's range) - treated as "no request
// possible" rather than taking the whole panel down while rendering.
export const safeUrl = (
  build: () => string | undefined,
): string | undefined => {
  try {
    return build();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(e);
    return undefined;
  }
};

export const formatTimeTick = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatHistogramTick = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

// The "open this request in a new tab" link next to each layer's result.
export const RequestLink = ({
  url,
}: {
  url: string | undefined;
}): React.ReactElement | null =>
  url ? (
    <a target="_blank" rel="noreferrer" href={url}>
      &#x29c9;
    </a>
  ) : null;

interface QueryLayerItemProps {
  layer: AdagucLayer;
  subTab: SubTab;
  caption: React.ReactNode;
  children: React.ReactNode;
}

// One layer's result, in the same frame for every subtab.
export const QueryLayerItem = ({
  layer,
  subTab,
  caption,
  children,
}: QueryLayerItemProps): React.ReactElement => (
  <div className="query_panel_item">
    <div className="query_panel_item_header">
      <code>{layer.name}</code>
    </div>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      {subTab}
      {caption}
    </Typography>
    <div className="query_panel_item_body">{children}</div>
  </div>
);
