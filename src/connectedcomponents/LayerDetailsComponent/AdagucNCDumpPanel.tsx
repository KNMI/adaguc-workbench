import React from 'react';
import { WMLayer } from '@opengeoweb/webmap';
import { CopyToClipBoard } from '../CopyToClipBoard';

interface AdagucNCDumpPanelProps {
  wmLayer: WMLayer;
}
const AdagucNCDumpPanel = ({
  wmLayer,
}: AdagucNCDumpPanelProps): React.ReactElement => {
  const [metadata, setMetadata] = React.useState('Fetching ...');
  const url = `${wmLayer.service}&service=wms&request=getmetadata&format=text/plain&layer=${wmLayer.name}`;

  void fetch(url).then(async (r) => {
    const g = await r.text();
    setMetadata(g);
  });
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: '50px' }}>
        <CopyToClipBoard info="Metadata link" text={url} />
        <a target="_blank" rel="noreferrer" href={url}>
          {url}
        </a>
      </div>
      <div
        style={{
          overflow: 'scroll',
          height: '80%',
          margin: '5px',
          padding: '5px',
          fontSize: '10px',
          fontFamily: 'courier',
          background: 'white',
        }}
      >
        <pre>{metadata}</pre>
      </div>
    </div>
  );
};

export default AdagucNCDumpPanel;
