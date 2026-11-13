import * as React from 'react';
import {
  Box,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Bbox, WMLayer } from '@opengeoweb/webmap';
import { useAppSelector } from '../../store/store';
import { AdagucMapView, ViewerState } from '../../store/types';
import { CopyToClipBoard } from '../CopyToClipBoard';
import { xmlToJson } from '../../utils/xmlToJson';
import {
  WCSCoverage,
  parseDescribeCoverage,
} from '../../utils/parseDescribeCoverage';
import {
  WCSCoverageSummary,
  parseWCSCapabilities,
} from '../../utils/parseWCSCapabilities';
import {
  GetCoverageGridProperties,
  getCoverageUrl,
  makeGoodServiceLink,
} from '../../utils/getCoverageUrl';

export interface WCSPanelProps {
  mapId: string;
  wmLayer: WMLayer;
}

interface ProjectionOption {
  srs: string;
  bbox: Bbox;
  label: string;
}

type GridMode = GetCoverageGridProperties['mode'];

// Ports webmapjsext/WMJSExt/WCSPanel.js as a React component: fetches a WCS
// DescribeCoverage for this layer, lets the user tune a GetCoverage request
// (projection, area, output grid, dimensions, format), and shows the
// resulting GetCoverage url - live-updating and copy-pastable.
const WCSPanel = ({ mapId, wmLayer }: WCSPanelProps): React.ReactElement => {
  const view = useAppSelector(
    (state: ViewerState): AdagucMapView => state?.viewer?.maps[mapId]?.view,
  );

  const [coverage, setCoverage] = React.useState<WCSCoverage | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const [availableCoverages, setAvailableCoverages] = React.useState<
    WCSCoverageSummary[]
  >([]);
  const [selectedCoverageName, setSelectedCoverageName] = React.useState(
    wmLayer.name ?? '',
  );

  const [selectedProjectionIndex, setSelectedProjectionIndex] =
    React.useState(0);
  const [bbox, setBbox] = React.useState<Bbox>({
    left: 0,
    bottom: 0,
    right: 0,
    top: 0,
  });
  const [gridMode, setGridMode] = React.useState<GridMode>('cellsize');
  const [xResolution, setXResolution] = React.useState('');
  const [yResolution, setYResolution] = React.useState('');
  const [rasterWidth, setRasterWidth] = React.useState('');
  const [rasterHeight, setRasterHeight] = React.useState('');
  const [selectedFormat, setSelectedFormat] = React.useState('');
  const [dimensionValues, setDimensionValues] = React.useState<
    Record<string, string>
  >({});

  // The dimension fields always come from this layer's own (WMS) current
  // dimension values, same as webmapjsext's WCSPanel.js - DescribeCoverage
  // doesn't need to (and in practice doesn't) describe them itself.
  const resetFieldsFromLayer = React.useEffectEvent(() => {
    const initialDimensionValues: Record<string, string> = {};
    wmLayer.dimensions.forEach((dimension) => {
      initialDimensionValues[dimension.name] = dimension.currentValue;
    });
    setDimensionValues(initialDimensionValues);
    setSelectedCoverageName(wmLayer.name ?? '');
  });
  React.useEffect(() => {
    resetFieldsFromLayer();
  }, [wmLayer.id]);

  // The service may offer more coverages than just the one this layer
  // happens to be - fetch the WCS's own GetCapabilities once per service so
  // the user can switch the panel to any of them.
  React.useEffect(() => {
    const url = `${makeGoodServiceLink(wmLayer.service)}SERVICE=WCS&REQUEST=GetCapabilities`;
    fetch(url)
      .then((response) => response.text())
      .then((xmlText) => {
        const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
        setAvailableCoverages(parseWCSCapabilities(xmlToJson(xmlDoc)));
      })
      .catch(() => {
        setAvailableCoverages([]);
      });
  }, [wmLayer.service]);

  React.useEffect(() => {
    setCoverage(null);
    setLoadError(null);
    setIsLoading(true);
    const url = `${makeGoodServiceLink(wmLayer.service)}SERVICE=WCS&REQUEST=DescribeCoverage&COVERAGE=${encodeURIComponent(
      selectedCoverageName ?? '',
    )}`;
    fetch(url)
      .then((response) => response.text())
      .then((xmlText) => {
        const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const parsedCoverage = parseDescribeCoverage(
          xmlToJson(xmlDoc),
          wmLayer.service,
        );
        setCoverage(parsedCoverage);

        const defaultProjectionIndex = Math.max(
          0,
          parsedCoverage.supportedProjections.findIndex(
            (p) => p.srs === parsedCoverage.nativeCRS,
          ),
        );
        const defaultProjection =
          parsedCoverage.supportedProjections[defaultProjectionIndex];
        setSelectedProjectionIndex(defaultProjectionIndex);
        if (defaultProjection) {
          setBbox(defaultProjection.bbox);
          const width =
            defaultProjection.bbox.right - defaultProjection.bbox.left;
          const height =
            defaultProjection.bbox.top - defaultProjection.bbox.bottom;
          setXResolution(String(width / parsedCoverage.width));
          setYResolution(String(height / parsedCoverage.height));
        }
        setRasterWidth(String(parsedCoverage.width));
        setRasterHeight(String(parsedCoverage.height));

        // Prefer NetCDF (in any of its advertised variants, e.g. NetCDF3/
        // NetCDF4) when the service offers it, then AAIGRID, then whatever
        // is listed first.
        // Prefer NetCDF (in any of its advertised variants, e.g. NetCDF3/
        // NetCDF4) when the service offers it, then AAIGRID, then whatever
        // is listed first.
        const defaultFormat =
          parsedCoverage.formats.find((format) =>
            format.toUpperCase().includes('NETCDF'),
          ) ??
          parsedCoverage.formats.find(
            (format) => format.toUpperCase() === 'AAIGRID',
          ) ??
          parsedCoverage.formats[0];
        setSelectedFormat(defaultFormat ?? '');
      })
      .catch((e: unknown) => {
        // String() on anything else (e.g. a plain object) would show
        // "[object Object]" - say something useful instead.
        if (e instanceof Error) {
          setLoadError(e.message);
        } else if (typeof e === 'string') {
          setLoadError(e);
        } else {
          setLoadError('Could not load the coverage description.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [wmLayer.service, selectedCoverageName]);

  // Appends the map's own current view as an extra, always-available
  // option - the same convenience webmapjsext's WCSPanel.js offered as
  // "Viewer window projection and area".
  const projectionOptions: ProjectionOption[] = React.useMemo(() => {
    const options: ProjectionOption[] = (
      coverage?.supportedProjections ?? []
    ).map((projection) => ({
      srs: projection.srs,
      bbox: projection.bbox,
      label: projection.srs,
    }));
    if (view?.srs && view?.bbox) {
      options.push({
        srs: view.srs,
        bbox: view.bbox,
        label: `${view.srs} (current map view)`,
      });
    }
    return options;
  }, [coverage, view]);

  const selectedProjection = projectionOptions[selectedProjectionIndex];

  const handleSelectProjection = (index: number): void => {
    setSelectedProjectionIndex(index);
    const option = projectionOptions[index];
    if (!option || !coverage) {
      return;
    }
    setBbox(option.bbox);
    const width = option.bbox.right - option.bbox.left;
    const height = option.bbox.top - option.bbox.bottom;
    setXResolution(String(width / coverage.width));
    setYResolution(String(height / coverage.height));
  };

  const handleBboxFieldChange =
    (field: keyof Bbox) =>
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const value = Number(event.target.value);
      setBbox((previous) => ({ ...previous, [field]: value }));
    };

  const requestUrl = React.useMemo(() => {
    if (!coverage || !selectedProjection) {
      return undefined;
    }
    const grid: GetCoverageGridProperties =
      gridMode === 'cellsize'
        ? {
            mode: 'cellsize',
            xResolution: parseFloat(xResolution) || 0,
            yResolution: parseFloat(yResolution) || 0,
          }
        : {
            mode: 'rastersize',
            width: parseInt(rasterWidth, 10) || 0,
            height: parseInt(rasterHeight, 10) || 0,
          };
    return getCoverageUrl({
      service: coverage.service,
      coverageName: coverage.name,
      projection: selectedProjection.srs,
      format: selectedFormat,
      bbox,
      grid,
      dimensionValues: Object.entries(dimensionValues).map(
        ([name, currentValue]) => ({ name, currentValue }),
      ),
    });
  }, [
    coverage,
    selectedProjection,
    selectedFormat,
    bbox,
    gridMode,
    xResolution,
    yResolution,
    rasterWidth,
    rasterHeight,
    dimensionValues,
  ]);

  if (isLoading) {
    return (
      <Stack sx={{ alignItems: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }

  if (loadError || !coverage) {
    return (
      <Typography color="error" sx={{ p: 2 }}>
        {loadError ?? 'This layer has no Web Coverage Service.'}
      </Typography>
    );
  }

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      {availableCoverages.length > 0 && (
        <FormControl size="small" fullWidth>
          <InputLabel size="small">Coverage</InputLabel>
          <Select
            size="small"
            label="Coverage"
            value={selectedCoverageName}
            MenuProps={{ sx: { zIndex: 2100 } }}
            onChange={(event) => {
              setSelectedCoverageName(event.target.value);
            }}
          >
            {availableCoverages.map((availableCoverage) => (
              <MenuItem
                key={availableCoverage.name}
                value={availableCoverage.name}
              >
                {availableCoverage.label ?? availableCoverage.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <Box>
        <Typography variant="subtitle1">
          {coverage.title ?? coverage.name}
        </Typography>
        {coverage.abstract && (
          <Typography variant="body2" color="text.secondary">
            {coverage.abstract}
          </Typography>
        )}
      </Box>

      <FormControl size="small" fullWidth>
        <InputLabel size="small">Coordinate reference system</InputLabel>
        <Select
          size="small"
          label="Coordinate reference system"
          value={selectedProjectionIndex}
          // WCSPanelDialog's own Popper sets zIndex: 2000 (needed to sit
          // above the rest of the app) - without this, the Select's
          // dropdown (portalled to the body like any MUI Popover, so
          // sibling to that Popper rather than nested inside it) would use
          // the theme's default modal zIndex and render underneath it.
          MenuProps={{ sx: { zIndex: 2100 } }}
          onChange={(event) => {
            handleSelectProjection(Number(event.target.value));
          }}
        >
          {projectionOptions.map((option, index) => (
            <MenuItem key={`${option.srs}-${index}`} value={index}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Area / bounding box
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            label="West"
            type="number"
            value={bbox.left}
            onChange={handleBboxFieldChange('left')}
          />
          <TextField
            size="small"
            label="South"
            type="number"
            value={bbox.bottom}
            onChange={handleBboxFieldChange('bottom')}
          />
          <TextField
            size="small"
            label="East"
            type="number"
            value={bbox.right}
            onChange={handleBboxFieldChange('right')}
          />
          <TextField
            size="small"
            label="North"
            type="number"
            value={bbox.top}
            onChange={handleBboxFieldChange('top')}
          />
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Grid properties
        </Typography>
        <RadioGroup
          value={gridMode}
          onChange={(event) => {
            setGridMode(event.target.value as GridMode);
          }}
        >
          <FormControlLabel
            value="cellsize"
            control={<Radio size="small" />}
            label="Cell size"
          />
          <Stack direction="row" spacing={1} sx={{ pl: 4, pb: 1 }}>
            <TextField
              size="small"
              label="X resolution"
              type="number"
              disabled={gridMode !== 'cellsize'}
              value={xResolution}
              onChange={(event) => {
                setXResolution(event.target.value);
              }}
            />
            <TextField
              size="small"
              label="Y resolution"
              type="number"
              disabled={gridMode !== 'cellsize'}
              value={yResolution}
              onChange={(event) => {
                setYResolution(event.target.value);
              }}
            />
          </Stack>
          <FormControlLabel
            value="rastersize"
            control={<Radio size="small" />}
            label="Raster size"
          />
          <Stack direction="row" spacing={1} sx={{ pl: 4 }}>
            <TextField
              size="small"
              label="Raster width"
              type="number"
              disabled={gridMode !== 'rastersize'}
              value={rasterWidth}
              onChange={(event) => {
                setRasterWidth(event.target.value);
              }}
            />
            <TextField
              size="small"
              label="Raster height"
              type="number"
              disabled={gridMode !== 'rastersize'}
              value={rasterHeight}
              onChange={(event) => {
                setRasterHeight(event.target.value);
              }}
            />
          </Stack>
        </RadioGroup>
      </Box>

      {wmLayer.dimensions.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Dimensions
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: 'wrap' }}
          >
            {wmLayer.dimensions.map((dimension) => (
              <TextField
                key={dimension.name}
                size="small"
                label={dimension.name}
                value={dimensionValues[dimension.name] ?? ''}
                onChange={(event) => {
                  const { value } = event.target;
                  setDimensionValues((previous) => ({
                    ...previous,
                    [dimension.name]: value,
                  }));
                }}
              />
            ))}
          </Stack>
        </Box>
      )}

      <FormControl size="small" fullWidth>
        <InputLabel size="small">Format</InputLabel>
        <Select
          size="small"
          label="Format"
          value={selectedFormat}
          MenuProps={{ sx: { zIndex: 2100 } }}
          onChange={(event) => {
            setSelectedFormat(event.target.value);
          }}
        >
          {coverage.formats.map((format) => (
            <MenuItem key={format} value={format}>
              {format}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          GetCoverage request
        </Typography>
        {requestUrl && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <CopyToClipBoard info="GetCoverage url" text={requestUrl} />
            <a target="_blank" rel="noreferrer" href={requestUrl}>
              {requestUrl}
            </a>
          </Box>
        )}
      </Box>
    </Stack>
  );
};

export default WCSPanel;
