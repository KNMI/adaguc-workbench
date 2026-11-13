/* eslint-disable @typescript-eslint/no-floating-promises */
import * as React from 'react';
import { awbColors } from '../../application/appTheme';
import { Button, IconButton, Tooltip } from '@mui/material';
import { ArrowForwardIos, ArrowBackIos } from '@mui/icons-material';
import { actions, useAppDispatch, useAppSelector } from '../../store/store';
import { MAP_ID } from '../../store/mapId';
import { ViewerState } from '../../store/types';
import AutoWMS from './AutoWMS';
import { thunks } from '../../store/thunks';
import QueryPanel from './QueryPanel';
import LegendPanel from './LegendPanel';
import BaseLayersPanel from './BaseLayersPanel';
import TimePanel from './TimePanel';

export interface ToolPanelInterface {
  toggleExpandToolsPanel: (expanded: boolean) => void;
  toolsPanelIsExpanded: boolean;
}
const SideToolPanel = ({
  toggleExpandToolsPanel,
  toolsPanelIsExpanded,
}: ToolPanelInterface): React.ReactElement => {
  const dispatch = useAppDispatch();
  const mapId = MAP_ID;
  const [tabPage, setTabPageState] = React.useState('AUTOWMS');

  const setTabPage = (value: string): void => {
    setTabPageState(value);
  };

  // GetFeatureInfo and TimeSeries, both subtabs of Query, act on a
  // map-click pin, so this is the single place deciding whether that pin
  // mode is on - owning it here (rather than having QueryPanel toggle it
  // itself) keeps it tied to the main tab regardless of which subtab is
  // showing.
  const isPinModeActive = tabPage === 'Query';
  React.useEffect(() => {
    dispatch(
      actions.setGetFeatureInfoActive({ mapId, active: isPinModeActive }),
    );
  }, [mapId, isPinModeActive, dispatch]);

  const autoWMSServiceCommand = useAppSelector(
    (state: ViewerState) => state?.viewer?.autoWMSServiceCommand,
  );
  // The top bar's "custom WMS service" field can send a service here (see
  // AdagucAppBar) instead of adding a layer, when it looks like an AutoWMS
  // explorer url - switch to this tab so the result is actually visible.
  const lastAppliedAutoWMSRequestId = React.useRef<number>(0);
  React.useEffect(() => {
    if (
      !autoWMSServiceCommand ||
      autoWMSServiceCommand.requestId === lastAppliedAutoWMSRequestId.current
    ) {
      return;
    }
    lastAppliedAutoWMSRequestId.current = autoWMSServiceCommand.requestId;
    setTabPage('AUTOWMS');
  }, [autoWMSServiceCommand]);

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div
        style={{
          display: 'block',
          width: '100%',
          // minHeight (not height): the main tab buttons below wrap onto a
          // second line once the panel's too narrow for all five at once -
          // a fixed height would stop short of that second line, letting
          // it overflow and overlap whatever renders right after this div
          // (e.g. QueryPanel's own sub-tabs) instead of pushing it down.
          minHeight: '40px',
          marginBottom: '0px',
          background: awbColors.water,
        }}
      >
        <Tooltip
          title={
            toolsPanelIsExpanded ? 'Collapse tool panel' : 'Expand tool panel'
          }
        >
          <IconButton
            size="small"
            edge="end"
            color="inherit"
            // Its own name, not "menu" - the top bar's Add data button
            // already uses that.
            aria-label={
              toolsPanelIsExpanded ? 'Collapse tool panel' : 'Expand tool panel'
            }
            aria-expanded={toolsPanelIsExpanded}
            onClick={() => {
              toggleExpandToolsPanel(!toolsPanelIsExpanded);
            }}
          >
            {toolsPanelIsExpanded ? <ArrowForwardIos /> : <ArrowBackIos />}
          </IconButton>
        </Tooltip>
        {toolsPanelIsExpanded && (
          <>
            <Button
              size="small"
              variant={tabPage === 'AUTOWMS' ? 'contained' : 'outlined'}
              onClick={() => {
                setTabPage('AUTOWMS');
              }}
            >
              AutoWMS
            </Button>
            <Button
              size="small"
              variant={tabPage === 'Query' ? 'contained' : 'outlined'}
              onClick={() => {
                setTabPage('Query');
              }}
            >
              Queries
            </Button>
            <Button
              size="small"
              variant={tabPage === 'Legend' ? 'contained' : 'outlined'}
              onClick={() => {
                setTabPage('Legend');
              }}
            >
              Legend
            </Button>
            <Button
              size="small"
              variant={tabPage === 'Baselayers' ? 'contained' : 'outlined'}
              onClick={() => {
                setTabPage('Baselayers');
              }}
            >
              Baselayers
            </Button>
            <Button
              size="small"
              variant={tabPage === 'Time' ? 'contained' : 'outlined'}
              onClick={() => {
                setTabPage('Time');
              }}
            >
              Time
            </Button>
          </>
        )}
      </div>
      <div
        style={{
          display: toolsPanelIsExpanded ? 'contents' : 'none',
          height: 'inherit',
          width: '100%',
        }}
      >
        <div style={{ display: tabPage === 'AUTOWMS' ? 'contents' : 'none' }}>
          <AutoWMS
            isActive={tabPage === 'AUTOWMS'}
            externalServiceRequest={autoWMSServiceCommand}
            addLayer={(service: string, name: string): void => {
              dispatch(
                thunks.addLayer({
                  serviceUrl: service,
                  name,
                  mapId,
                }),
              );
            }}
          />
        </div>
        <div
          className="query_panel_container"
          style={{
            display: tabPage === 'Query' ? 'block' : 'none',
          }}
        >
          <QueryPanel mapId={mapId} isActive={tabPage === 'Query'} />
        </div>
        <div
          className="legend_panel_container"
          style={{
            display: tabPage === 'Legend' ? 'block' : 'none',
          }}
        >
          <LegendPanel mapId={mapId} />
        </div>
        <div
          className="baselayers_panel_container"
          style={{
            display: tabPage === 'Baselayers' ? 'block' : 'none',
          }}
        >
          <BaseLayersPanel />
        </div>
        <div
          className="time_panel_container"
          style={{
            display: tabPage === 'Time' ? 'block' : 'none',
            height: '100%',
          }}
        >
          <TimePanel mapId={mapId} />
        </div>
      </div>
    </div>
  );
};

export default SideToolPanel;
