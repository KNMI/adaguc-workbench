import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAppDispatch, useAppSelector } from '../../store/store';
import SideToolPanel from './SideToolPanel';

jest.mock('../../store/thunks', () => ({
  thunks: { addLayer: jest.fn() },
}));

// The panels' own content/behaviour isn't under test here - only how
// SideToolPanel drives the shared pin-mode flag and the Query tab's
// `isActive` prop as tabs change. QueryPanel is mocked with a function that
// records the props it was rendered with, so tests can assert on those.
const mockQueryPanelRenders: Array<{ mapId: string; isActive: boolean }> = [];
jest.mock('./AutoWMS', () => ({ __esModule: true, default: () => null }));
jest.mock('./QueryPanel', () => ({
  __esModule: true,
  default: (props: { mapId: string; isActive: boolean }) => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-call
    require('react').useEffect(() => {
      mockQueryPanelRenders.push(props);
    });
    return null;
  },
}));
jest.mock('./LegendPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./BaseLayersPanel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./TimePanel', () => ({ __esModule: true, default: () => null }));

jest.mock('../../store/store', () => ({
  actions: {
    setGetFeatureInfoActive: (payload: unknown) => ({
      type: 'wmsservices/setGetFeatureInfoActive',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockUseAppSelector = jest.mocked(useAppSelector);

const PIN_MODE_ACTION = 'wmsservices/setGetFeatureInfoActive';

interface DispatchedAction {
  type: string;
  payload: { mapId: string; active: boolean };
}

describe('SideToolPanel', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    mockQueryPanelRenders.length = 0;
    mockDispatch = jest.fn();
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockUseAppSelector.mockImplementation((selector) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selector({ viewer: {} } as any),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const pinModeDispatches = (): Array<{ mapId: string; active: boolean }> =>
    (mockDispatch.mock.calls as [DispatchedAction][])
      .map(([dispatchedAction]) => dispatchedAction)
      .filter((dispatchedAction) => dispatchedAction.type === PIN_MODE_ACTION)
      .map((dispatchedAction) => dispatchedAction.payload);

  it('turns pin mode on for Query and off for AutoWMS', () => {
    render(
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={jest.fn()} />,
    );

    // AUTOWMS is the default tab, so pin mode starts off.
    expect(pinModeDispatches().at(-1)).toEqual({
      mapId: 'map1',
      active: false,
    });

    act(() => {
      fireEvent.click(screen.getByText('Query'));
    });
    expect(pinModeDispatches().at(-1)).toEqual({
      mapId: 'map1',
      active: true,
    });

    act(() => {
      fireEvent.click(screen.getByText('AutoWMS'));
    });
    expect(pinModeDispatches().at(-1)).toEqual({
      mapId: 'map1',
      active: false,
    });
  });

  it('only marks QueryPanel active while the Query tab is shown', () => {
    // Regression guard: QueryPanel stays mounted (just hidden) while another
    // main tab is shown, so it relies on this prop - rather than unmounting
    // - to know when to stop owning the map's histogram box-select mode.
    render(
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={jest.fn()} />,
    );
    expect(mockQueryPanelRenders.at(-1)).toEqual({
      mapId: 'map1',
      isActive: false,
    });

    act(() => {
      fireEvent.click(screen.getByText('Query'));
    });
    expect(mockQueryPanelRenders.at(-1)).toEqual({
      mapId: 'map1',
      isActive: true,
    });

    act(() => {
      fireEvent.click(screen.getByText('Legend'));
    });
    expect(mockQueryPanelRenders.at(-1)).toEqual({
      mapId: 'map1',
      isActive: false,
    });
  });

  it('switches to the AutoWMS tab when an AutoWMS service command arrives', () => {
    // Regression guard: the top bar's "custom WMS service" field (see
    // AdagucAppBar) can send an AutoWMS explorer url here instead of
    // adding a layer - that's only useful if the user actually lands on
    // the tab showing it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let state: any = { viewer: {} };
    mockUseAppSelector.mockImplementation((selector) => selector(state));

    const { rerender } = render(
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={jest.fn()} />,
    );

    act(() => {
      fireEvent.click(screen.getByText('Query'));
    });
    expect(screen.getByText('Query').getAttribute('class')).toContain(
      'MuiButton-contained',
    );

    state = {
      viewer: {
        autoWMSServiceCommand: { service: 'http://x/autowms?', requestId: 1 },
      },
    };
    act(() => {
      rerender(
        <SideToolPanel
          toolsPanelIsExpanded
          toggleExpandToolsPanel={jest.fn()}
        />,
      );
    });

    expect(screen.getByText('AutoWMS').getAttribute('class')).toContain(
      'MuiButton-contained',
    );
  });

  it("lets the main tab bar grow past its 40px minimum, so wrapped tab buttons don't overlap the panel below", () => {
    // Regression guard: a narrow panel wraps the 5 main tab buttons onto a
    // second line - a fixed (rather than minimum) height here used to
    // clip at the first line, so that wrapped second line overflowed
    // and overlapped whatever rendered right after this bar instead of
    // the bar growing to fit it.
    const { container } = render(
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={jest.fn()} />,
    );

    const tabBar = container.querySelector('[style*="min-height"]');
    expect(tabBar).not.toBeNull();
    expect(tabBar).toHaveStyle({ minHeight: '40px' });
  });

  it('switches to the Time tab, next to Baselayers', () => {
    render(
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={jest.fn()} />,
    );

    act(() => {
      fireEvent.click(screen.getByText('Time'));
    });

    expect(screen.getByText('Time').getAttribute('class')).toContain(
      'MuiButton-contained',
    );
  });
});
