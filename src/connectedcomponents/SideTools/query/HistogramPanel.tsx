import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { UseQueryResult, useQueries } from '@tanstack/react-query';
import { actions, useAppDispatch, useAppSelector } from '../../../store/store';
import { selectors } from '../../../store/selectors';
import {
  AdagucHistogramBox,
  AdagucLayer,
  ViewerState,
} from '../../../store/types';
import { getHistogramUrl } from '../../../utils/getHistogramUrl';
import {
  HistogramResult,
  parseHistogramResponse,
} from '../../../utils/parseHistogramResponse';
import {
  QueryLayerItem,
  RequestLink,
  SubPanelProps,
  fetchParsed,
  formatHistogramTick,
  queryPanelQueryOptions,
  safeUrl,
} from './queryShared';

const HistogramPanel = ({
  mapId,
  isShown,
}: SubPanelProps): React.ReactElement | null => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const layers = useAppSelector((state: ViewerState): AdagucLayer[] =>
    selectors.getMapLayers(state, mapId),
  );
  const isBoxSelectActive = useAppSelector(
    (state: ViewerState): boolean =>
      state?.viewer?.maps[mapId]?.isHistogramBoxSelectActive,
  );
  const histogramBox = useAppSelector(
    (state: ViewerState): AdagucHistogramBox | undefined =>
      state?.viewer?.maps[mapId]?.histogramBox,
  );
  const enabledLayers = layers.filter((layer) => layer.enabled);

  // Keyed by the request url: a new box, or a change to anything the
  // request includes (style, dimensions), fetches anew.
  const urls = enabledLayers.map((layer) =>
    histogramBox
      ? safeUrl(() =>
          getHistogramUrl(
            layer,
            histogramBox.bbox,
            histogramBox.srs,
            histogramBox.pixelWidth,
            histogramBox.pixelHeight,
          ),
        )
      : undefined,
  );
  const results = useQueries({
    queries: urls.map((url) => ({
      queryKey: ['query-panel', 'histogram', url],
      queryFn: () => fetchParsed(url ?? '', parseHistogramResponse),
      enabled: !!url,
      ...queryPanelQueryOptions,
    })),
  });

  if (!isShown) {
    return null;
  }

  const renderBody = (
    url: string | undefined,
    query: UseQueryResult<HistogramResult>,
  ): React.ReactNode => {
    if (!histogramBox) {
      return 'Select an area on the map to see its histogram';
    }
    if (!url) {
      return 'Layer is not ready yet';
    }
    if (query.isError) {
      return query.error.message ? (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          Failed to load histogram: {query.error.message}
        </span>
      ) : (
        'Failed to load histogram'
      );
    }
    if (!query.data) {
      return 'Loading…';
    }
    const result = query.data;
    if (result.bins.length === 0) {
      return 'No data for this area';
    }
    const chartData = result.bins.map((bin) => ({
      value: bin.value,
      count: bin.count,
    }));
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid
            stroke={theme.palette.divider}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="value"
            tickFormatter={formatHistogramTick}
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            minTickGap={20}
            label={
              result.units
                ? {
                    value: result.units,
                    position: 'insideBottom',
                    offset: -5,
                    fontSize: 11,
                    fill: theme.palette.text.secondary,
                  }
                : undefined
            }
          />
          <YAxis
            stroke={theme.palette.text.secondary}
            tick={{ fontSize: 11 }}
            width={55}
            label={{
              value: 'count',
              angle: -90,
              position: 'insideLeft',
              fontSize: 11,
              fill: theme.palette.text.secondary,
            }}
          />
          <Tooltip
            labelFormatter={(label) =>
              typeof label === 'number'
                ? `${formatHistogramTick(label)} ${result.units ?? ''}`.trim()
                : label
            }
          />
          <Bar
            dataKey="count"
            fill={theme.palette.primary.main}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <>
      <div className="query_panel_header" style={{ paddingTop: 0 }}>
        <Button
          size="small"
          variant={isBoxSelectActive ? 'contained' : 'outlined'}
          onClick={() => {
            dispatch(
              actions.setHistogramBoxSelectActive({
                mapId,
                active: !isBoxSelectActive,
              }),
            );
          }}
        >
          {isBoxSelectActive
            ? 'Click and drag a box on the map…'
            : 'Select area for histogram'}
        </Button>
      </div>
      {enabledLayers.map((layer, index) => {
        const query = results[index];
        const result = query.data;
        return (
          <QueryLayerItem
            key={layer.id}
            layer={layer}
            subTab="Histogram"
            caption={
              <>
                {result && (
                  <span>
                    min {formatHistogramTick(result.min)}, max{' '}
                    {formatHistogramTick(result.max)}, avg{' '}
                    {formatHistogramTick(result.average)}
                    {result.units ? ` ${result.units}` : ''}
                  </span>
                )}
                <RequestLink url={urls[index]} />
              </>
            }
          >
            {renderBody(urls[index], query)}
          </QueryLayerItem>
        );
      })}
    </>
  );
};

export default HistogramPanel;
