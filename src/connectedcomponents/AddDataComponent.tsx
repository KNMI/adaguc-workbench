import * as React from 'react';
import { ThemeWrapper } from '@opengeoweb/theme';
import 'react-mosaic-component/react-mosaic-component.css';
import '../assets/styles.css';

import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { Grid, Paper } from '@mui/material';
import {
  OpenLayersLayer,
  OpenLayersMapView,
  makeView,
  setViewFromExtent,
} from '@opengeoweb/webmap-react';
import { LayerType, WMBBOX, generateMapId } from '@opengeoweb/webmap';
import { baseLayerWorldMap } from '../utils/layerDefinitions';
import WMSServiceInput from './WMSServiceInput';

export interface DataElementType {
  title?: string;
  subtitle?: string;
  service: string;
  layer?: string;
  srs?: string;
  bbox?: string;
  baselayername?: string;
  opacity?: number;
}

interface DataElementProps extends DataElementType {
  handleAddData: (args: DataElementType) => void;
}
const DataElement = (
  element: DataElementProps,
): React.ReactElement<DataElementProps> => {
  const { title, subtitle, handleAddData, layer, service, srs, bbox } = element;

  // Generated once, on mount.
  const [mapId] = React.useState(generateMapId);
  const view = React.useMemo(() => {
    const newView = makeView(srs || 'EPSG:3857');
    if (bbox) {
      setViewFromExtent(newView, new WMBBOX(bbox));
    }
    return newView;
  }, [srs, bbox]);
  return (
    <Grid style={{ display: 'inline' }}>
      <IconButton
        onClick={() => {
          handleAddData(element);
        }}
      >
        <Paper sx={{ width: '300px', height: '200px', overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              width: '300px',
              height: '200px',
              padding: 0,
              margin: 0,
              zIndex: 0,
            }}
          >
            <OpenLayersMapView mapId={mapId} view={view} passiveMap>
              <OpenLayersLayer {...baseLayerWorldMap} />
              <OpenLayersLayer
                id={mapId + layer + service}
                service={service}
                name={layer}
                layerType={LayerType.mapLayer}
              />
            </OpenLayersMapView>
          </div>

          <div
            style={{
              position: 'absolute',
              width: '300px',
              height: '200px',
              padding: 20,
              margin: 0,
            }}
          >
            <Typography component="div" variant="h5">
              {title}
            </Typography>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              component="div"
            >
              {subtitle}
            </Typography>
          </div>
        </Paper>
      </IconButton>
    </Grid>
  );
};

export interface AddDataComponentProps {
  handleAddData: (args: DataElementType) => void;
  // Called once a url typed into the custom-service field has been
  // successfully routed (added as a layer, or opened in the AutoWMS
  // panel) - lets the dialog this is shown in close itself.
  onServiceHandled?: () => void;
}
const AddDataComponent = ({
  handleAddData,
  onServiceHandled,
}: AddDataComponentProps): React.ReactElement<AddDataComponentProps> => {
  const elements: DataElementType[] = [
    {
      title: 'KNMI realtime precipitation radar',
      service: 'https://geoservices.knmi.nl/adagucserver?dataset=RADAR&',
      layer: 'RAD_NL25_PCP_CM',
      srs: 'EPSG:3857',
      bbox: '220000,6500000,1000000,7200000',
      baselayername: 'streetmap',
      opacity: 0.8,
    },
    {
      title: 'KNMI: Actuele 10min observaties',
      service: 'https://geoservices.knmi.nl/wms?DATASET=OBS&',
      layer: '10M/ta',
      bbox: '220000,6500000,1000000,7200000',
    },
    {
      title: 'KNMI: Dagelijks geinterpoleerde grids',
      service:
        'https://geoservices.knmi.nl/adagucserver?dataset=gridded_interpolations&',
      layer: 'daily_temperature/INTER_OPER_R___TAVGD___L3__0005_prediction',
      bbox: '220000,6500000,1000000,7200000',
    },
    {
      title: 'KNMI: Waarneemstations',
      service:
        'https://geoservices.knmi.nl/adagucserver?dataset=knmi_waarneemstations&',
      layer: 'obs_temp',
      bbox: '220000,6500000,1000000,7200000',
    },
    {
      title: 'MSG-CPP: clouds, radiation and precipitation from Meteosat',
      service:
        'https://adaguc-server-msg-cpp-portal.pmc.knmi.cloud/adaguc-server?DATASET=msgrt&SERVICE=WMS&',
      layer: 'atmosphere_optical_thickness_due_to_cloud',
      bbox: '220000,6500000,1000000,7200000',
    },
    {
      title: 'NWCSAF GEO CT',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=CT&',
      layer: 'CT_ct',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO CTTH',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=CTTH&',
      layer: 'CTTH_ctth_alti',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO CMIC',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=CMIC&',
      layer: 'CMIC_cmic_phase',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO PC',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=PC&',
      layer: 'PC_pc',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO CRRPh Intensity',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=CRRPh&',
      layer: 'CRRPh_crrph_intensity',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO RDT',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=RDT_NOW&',
      layer: 'RDT',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO CI + 30',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=CI&',
      layer: 'CI_ci_prob30',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO iSHAI TPW',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=iSHAI&',
      layer: 'iSHAI_ishai_tpw',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO iSHAI LI index',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=iSHAI&',
      layer: 'iSHAI_ishai_li',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO iSHAI dif BL ',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=iSHAI&',
      layer: 'iSHAI_ishai_diffbl',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO iSHAI dif ML ',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=iSHAI&',
      layer: 'iSHAI_ishai_diffml',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO iSHAI dif HL ',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//wms?DATASET=iSHAI&',
      layer: 'iSHAI_ishai_diffhl',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO ASII TF',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//adagucserver?dataset=ASII-TF&',
      layer: 'ASII-TF_asii_turb_trop_prob',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO ASII GW',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//adagucserver?dataset=ASII-GW&',
      layer: 'ASII-GW_asii_turb_wave_prob',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'Cloudiness MSG',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//adagucserver?dataset=iSHAI&',
      layer: 'iSHAI_IR_band',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
    {
      title: 'NWCSAF GEO HRW ',
      service:
        'http://nwcsaf-adaguc-proofs.aemet.es/adaguc-services//adagucserver?dataset=HRW&',
      layer: 'windHRW',
      bbox: '-4369995.479204058,2273591.761932018,3159367.8143113023,12155389.355093244',
    },
  ];

  return (
    <ThemeWrapper>
      <Grid container style={{ display: 'flex' }}>
        <Grid
          style={{
            display: 'block',
            width: 'inherit',
            height: '100px',
          }}
        >
          <WMSServiceInput
            placeholder="Add custom WMS or AutoWMS service"
            sx={{ width: 'inherit' }}
            onHandled={onServiceHandled}
          />
        </Grid>
        <Grid style={{ display: 'block' }}>
          {elements.map((element: DataElementProps) => {
            const key = `${element.service}_${element.layer}`;
            return (
              <DataElement
                key={key}
                {...element}
                handleAddData={handleAddData}
              />
            );
          })}
        </Grid>
      </Grid>
    </ThemeWrapper>
  );
};

export default AddDataComponent;
