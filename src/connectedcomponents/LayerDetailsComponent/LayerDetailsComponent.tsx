import React from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { queryWMSLayers } from '@opengeoweb/webmap';
import { getWMLayer } from '../../utils/getWMLayer';
import ProjectionSelector from './ProjectionSelector';
import AdagucNCDumpPanel from './AdagucNCDumpPanel';
import WMSColorRangeSelector from './WMSColorRangeSelector';
import WCSPanelDialog from './WCSPanelDialog';
import { CopyToClipBoard } from '../CopyToClipBoard';

export interface LayerDetailsComponentProps {
  mapId: string;
  layerId: string;
}

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

const CustomTabPanel = (props: TabPanelProps) => {
  const { children, value, index } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      style={{
        height: '100%',
        margin: '0px',
      }}
    >
      {value === index && <Box sx={{ p: 0, height: '100%' }}>{children}</Box>}
    </div>
  );
};

const LayerDetailsComponent = ({
  mapId,
  layerId,
}: LayerDetailsComponentProps): React.ReactElement<LayerDetailsComponentProps> => {
  const [layerIdState] = React.useState(layerId);
  const [value, setValue] = React.useState(0);
  const [isWCSPanelOpen, setIsWCSPanelOpen] = React.useState(false);
  const [layerObject, setLayerObject] = React.useState<object>();

  const wmLayer = getWMLayer(layerIdState);
  const wmLayerService = wmLayer?.service;
  const wmLayerName = wmLayer?.name;

  React.useEffect(() => {
    if (!wmLayerService) {
      return;
    }
    setLayerObject({});
    queryWMSLayers(wmLayerService)
      .then((s) => {
        const r = s.filter((_layer) => {
          return _layer?.name === wmLayerName;
        });
        if (r.length === 1) {
          setLayerObject(r[0]);
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error(e);
      });
  }, [wmLayerService, wmLayerName]);

  if (!wmLayer) {
    return <div>No layer found</div>;
  }

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="basic tabs example"
        >
          <Tab label="Coordinate reference systems" />
          <Tab label="WMS Details" />
          <Tab label="Adaguc NCDump" />
          <Tab label="WMS Color range" />
        </Tabs>
        <Button
          size="small"
          onClick={() => {
            setIsWCSPanelOpen(true);
          }}
        >
          WCS
        </Button>
      </Box>
      <WCSPanelDialog
        mapId={mapId}
        wmLayer={wmLayer}
        isOpen={isWCSPanelOpen}
        onClose={() => {
          setIsWCSPanelOpen(false);
        }}
      />
      <Box sx={{ height: '100%' }}>
        <CustomTabPanel value={value} index={0}>
          <ProjectionSelector mapId={mapId} wmLayer={wmLayer} />
        </CustomTabPanel>
        <CustomTabPanel value={value} index={1}>
          Details
          <hr />
          WMS Service link:
          <CopyToClipBoard info="WMS Service link" text={wmLayer.service} />
          <a target="_blank" rel="noreferrer" href={wmLayer.service}>
            {wmLayer.service}
          </a>
          <hr />
          Layer name
          <CopyToClipBoard info="WMS Layer name" text={wmLayer.name ?? ''} />
          <a target="_blank" rel="noreferrer" href={wmLayer.name}>
            {wmLayer.name}
          </a>
          <div
            style={{
              overflow: 'scroll',
              height: '400px',
              margin: '5px',
              padding: '5px',
              fontSize: '10px',
              fontFamily: 'var(--awb-font-mono)',
              background: 'white',
            }}
          >
            <CopyToClipBoard
              info="WMS layerObject"
              text={JSON.stringify(layerObject, null, 2)}
            />
            <pre>{JSON.stringify(layerObject, null, 2)}</pre>
          </div>
        </CustomTabPanel>
        <CustomTabPanel value={value} index={2}>
          <AdagucNCDumpPanel wmLayer={wmLayer} />
        </CustomTabPanel>
        <CustomTabPanel value={value} index={3}>
          <WMSColorRangeSelector wmLayer={wmLayer} />
        </CustomTabPanel>
      </Box>
    </Box>
  );
};

export default LayerDetailsComponent;
