import * as React from 'react';
import { awbColors } from '../../application/appTheme';
import { Popper, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { LayerProps } from '@opengeoweb/webmap';
import { CopyToClipBoard } from '../CopyToClipBoard';

export interface AutoWMSLayerDetailsDialogProps {
  serviceUrl: string;
  layer: LayerProps | null;
  onClose: () => void;
}

// A details popup for a layer the user hasn't added to the map yet, styled
// like LayerDetailDialog's "WMS Details" tab. It can't reuse that dialog
// directly: it reads a live, already-registered WMLayer (getWMLayer),
// which an AutoWMS preview layer never has, and two of its other tabs
// (color range, projections) would act on the real map's current view even
// though this layer was never added to it. Everything shown here instead
// comes straight from the LayerProps AutoWMS already fetched.
const AutoWMSLayerDetailsDialog = ({
  serviceUrl,
  layer,
  onClose,
}: AutoWMSLayerDetailsDialogProps): React.ReactElement => {
  return (
    <Popper
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2000,
        background: awbColors.surface,
        border: `1px solid ${awbColors.waterDark}`,
        height: '80vh',
        width: '80vw',
        overflow: 'auto',
      }}
      open={layer !== null}
    >
      <DialogTitle>Layer details for {layer?.name}</DialogTitle>
      <IconButton
        aria-label="close"
        onClick={onClose}
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          color: (theme) => theme.palette.grey[500],
        }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent>
        {layer && (
          <>
            <div data-testid="layer-details-summary">
              WMS Service link:
              <CopyToClipBoard info="WMS Service link" text={serviceUrl} />
              <a target="_blank" rel="noreferrer" href={serviceUrl}>
                {serviceUrl}
              </a>
              <hr />
              Layer name
              <CopyToClipBoard info="WMS Layer name" text={layer.name || ''} />
              <code>{layer.name}</code>
              {layer.abstract && (
                <>
                  <hr />
                  Abstract: {layer.abstract}
                </>
              )}
              {layer.styles && layer.styles.length > 0 && (
                <>
                  <hr />
                  Styles:
                  <ul>
                    {layer.styles.map((style) => (
                      <li key={style.name}>
                        {style.title || style.name} <code>{style.name}</code>
                        <CopyToClipBoard
                          info={`style id for ${style.title || style.name}`}
                          text={style.name}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {layer.dimensions && layer.dimensions.length > 0 && (
                <>
                  <hr />
                  Dimensions:
                  <ul>
                    {layer.dimensions.map((dimension) => (
                      <li key={dimension.name}>
                        {dimension.name}: {dimension.currentValue}
                        {dimension.units ? ` (${dimension.units})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {layer.geographicBoundingBox && (
                <>
                  <hr />
                  Bounding box: west {layer.geographicBoundingBox.west}, east{' '}
                  {layer.geographicBoundingBox.east}, south{' '}
                  {layer.geographicBoundingBox.south}, north{' '}
                  {layer.geographicBoundingBox.north}
                </>
              )}
            </div>
            <div
              style={{
                overflow: 'scroll',
                height: '400px',
                margin: '5px',
                padding: '5px',
                fontSize: '10px',
                fontFamily: 'var(--awb-font-mono)',
                background: awbColors.surface,
              }}
            >
              <CopyToClipBoard
                info="WMS layerObject"
                text={JSON.stringify(layer, null, 2)}
              />
              <pre>{JSON.stringify(layer, null, 2)}</pre>
            </div>
          </>
        )}
      </DialogContent>
    </Popper>
  );
};

export default AutoWMSLayerDetailsDialog;
