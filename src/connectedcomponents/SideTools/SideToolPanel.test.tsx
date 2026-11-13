import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { actions, createAppStore } from '../../store/store';
import { MAP_ID } from '../../store/mapId';
import { emptyMap } from '../../testUtils/renderWithStore';
import SideToolPanel from './SideToolPanel';

// The panels' own content/behaviour isn't under test here - only how
// SideToolPanel drives the shared pin-mode flag and the Query tab's
// `isActive` prop as tabs change. QueryPanel is mocked with a function that
// records the props it was rendered with, so tests can assert on those.
const mockQueryPanelRenders: Array<{ mapId: string; isActive: boolean }> = [];
vi.mock('./AutoWMS', () => ({ default: () => null }));
vi.mock('./QueryPanel', () => ({
  default: function QueryPanelMock(props: {
    mapId: string;
    isActive: boolean;
  }) {
    React.useEffect(() => {
      mockQueryPanelRenders.push(props);
    });
    return null;
  },
}));
vi.mock('./LegendPanel', () => ({ default: () => null }));
vi.mock('./BaseLayersPanel', () => ({
  default: () => null,
}));
vi.mock('./TimePanel', () => ({ default: () => null }));

// Renders the panel inside a real store holding the app's one map. Pin
// mode starts on there, so the tests can tell the panel actually switched
// it off rather than it just being off already.
const renderPanel = () => {
  const store = createAppStore({
    viewer: {
      maps: { [MAP_ID]: emptyMap({ isGetFeatureInfoActive: true }) },
      services: {},
      baseLayers: [],
    },
  });
  const renderResult = render(
    <Provider store={store}>
      <SideToolPanel toolsPanelIsExpanded toggleExpandToolsPanel={vi.fn()} />
    </Provider>,
  );
  return { store, ...renderResult };
};

describe('SideToolPanel', () => {
  beforeEach(() => {
    mockQueryPanelRenders.length = 0;
  });

  it('turns pin mode on for Query and off for AutoWMS', () => {
    const { store } = renderPanel();
    const isPinModeActive = (): boolean =>
      store.getState().viewer.maps[MAP_ID].isGetFeatureInfoActive;

    // AUTOWMS is the default tab, so pin mode starts off.
    expect(isPinModeActive()).toBe(false);

    act(() => {
      fireEvent.click(screen.getByText('Queries'));
    });
    expect(isPinModeActive()).toBe(true);

    act(() => {
      fireEvent.click(screen.getByText('AutoWMS'));
    });
    expect(isPinModeActive()).toBe(false);
  });

  it('only marks QueryPanel active while the Query tab is shown', () => {
    // Regression guard: QueryPanel stays mounted (just hidden) while another
    // main tab is shown, so it relies on this prop - rather than unmounting
    // - to know when to stop owning the map's histogram box-select mode.
    renderPanel();
    expect(mockQueryPanelRenders.at(-1)).toEqual({
      mapId: 'map1',
      isActive: false,
    });

    act(() => {
      fireEvent.click(screen.getByText('Queries'));
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
    const { store } = renderPanel();

    act(() => {
      fireEvent.click(screen.getByText('Queries'));
    });
    expect(screen.getByText('Queries').getAttribute('class')).toContain(
      'MuiButton-contained',
    );

    act(() => {
      store.dispatch(
        actions.requestAutoWMSService({ service: 'http://x/autowms?' }),
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
    const { container } = renderPanel();

    const tabBar = container.querySelector('[style*="min-height"]');
    expect(tabBar).not.toBeNull();
    expect(tabBar).toHaveStyle({ minHeight: '40px' });
  });

  it('switches to the Time tab, next to Baselayers', () => {
    renderPanel();

    act(() => {
      fireEvent.click(screen.getByText('Time'));
    });

    expect(screen.getByText('Time').getAttribute('class')).toContain(
      'MuiButton-contained',
    );
  });
});
