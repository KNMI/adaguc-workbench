import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { LayerProps, WMSServiceInfo } from '@opengeoweb/webmap';
import { queryWMSLayers, queryWMSServiceInfo } from '@opengeoweb/webmap';
import AutoWMS from './AutoWMS';

jest.mock('@opengeoweb/webmap', () => ({
  queryWMSLayers: jest.fn(),
  queryWMSServiceInfo: jest.fn(),
}));

const mockQueryWMSLayers = jest.mocked(queryWMSLayers);
const mockQueryWMSServiceInfo = jest.mocked(queryWMSServiceInfo);

const AUTOWMS_URL = 'http://localhost:8080/autowms?';
const WMS_URL = 'http://example.com/wms?SERVICE=WMS&';

type FetchMockEntry = { url: string; init?: RequestInit };

const makeFetchMock = (
  handler: (url: string) => Promise<unknown>,
): jest.Mock => {
  const calls: FetchMockEntry[] = [];
  const mockFetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url).then((body) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(body),
    }));
  });
  (mockFetch as unknown as { calls: FetchMockEntry[] }).calls = calls;
  return mockFetch;
};

const configJsonHandler = (url: string): Promise<unknown> => {
  if (url === './config.json') {
    return Promise.resolve({});
  }
  return Promise.resolve({ result: [] });
};

// Wait for the LinearProgress indicator to disappear, i.e. for the full
// fetch(...).then(...).finally(...) chain of an in-flight request to settle.
const waitForLoadingToFinish = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
};

// Flush the mount-time `fetch('./config.json')` effect before interacting.
const flushConfigFetch = async (mockFetch: jest.Mock): Promise<void> => {
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith('./config.json');
  });
  await waitForLoadingToFinish();
};

describe('AutoWMS', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockQueryWMSLayers.mockReset();
    mockQueryWMSServiceInfo.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  });

  it('renders the AutoWMS input', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    expect(
      screen.getByLabelText('Add AutoWMS or WMS service'),
    ).toBeInTheDocument();

    await flushConfigFetch(mockFetch);
  });

  it('does not fetch the explorer listing while the user is still typing', async () => {
    jest.useFakeTimers();
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);
    mockFetch.mockClear();

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    // Simulate typing character by character, as the user reported, without
    // letting the debounce timer settle between keystrokes.
    for (let i = 1; i <= AUTOWMS_URL.length; i += 1) {
      fireEvent.change(input, { target: { value: AUTOWMS_URL.slice(0, i) } });
    }

    expect(mockFetch).not.toHaveBeenCalled();

    // Once the user pauses, exactly one request is made, for the full url.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `${AUTOWMS_URL}request=getfiles&path=`,
      );
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await waitForLoadingToFinish();
  });

  it('fetches immediately when the Load button is clicked, without waiting for the debounce', async () => {
    jest.useFakeTimers();
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);
    mockFetch.mockClear();

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });

    const loadButton = screen.getByRole('button', { name: 'Load service' });
    fireEvent.click(loadButton);

    expect(mockFetch).toHaveBeenCalledWith(
      `${AUTOWMS_URL}request=getfiles&path=`,
    );
    await waitForLoadingToFinish();
  });

  it('fetches immediately when Enter is pressed in the input', async () => {
    jest.useFakeTimers();
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);
    mockFetch.mockClear();

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockFetch).toHaveBeenCalledWith(
      `${AUTOWMS_URL}request=getfiles&path=`,
    );
    await waitForLoadingToFinish();
  });

  it('lists the layers of a WMS service and calls addLayer when one is selected', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      {
        name: 'layer1',
        title: 'Layer One',
        styles: [],
      } as unknown as LayerProps,
    ]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: 'Test abstract',
    } as unknown as WMSServiceInfo);

    const addLayer = jest.fn();
    render(<AutoWMS addLayer={addLayer} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    await waitFor(() => {
      expect(mockQueryWMSLayers).toHaveBeenCalledWith(
        `${WMS_URL}SERVICE=WMS&REQUEST=GetCapabilities`,
        true,
      );
    });

    expect(await screen.findByText(/Layer One/)).toBeInTheDocument();
    expect(screen.getByText(/Test abstract/)).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('Layer One'));
    expect(addLayer).toHaveBeenCalledWith(WMS_URL, 'layer1');
  });

  it('ignores a stale GetCapabilities response after the service changes again before it resolves', async () => {
    // Regression guard: switching away from a WMS service (e.g. to an
    // AutoWMS explorer url) while its GetCapabilities fetch is still in
    // flight used to let that stale response populate `layers` anyway -
    // with `ogcWMSService` by then cleared back to '', each layer's
    // preview image url (built as `${ogcWMSService}&LAYERS=...`) collapsed
    // to a bare "&LAYERS=..." that the browser resolved against the
    // current page instead of the actual WMS service.
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    let resolveFirstLayers: (layers: LayerProps[]) => void = () => {};
    const firstLayersPromise = new Promise<LayerProps[]>((resolve) => {
      resolveFirstLayers = resolve;
    });
    mockQueryWMSLayers.mockReturnValueOnce(firstLayersPromise);
    mockQueryWMSServiceInfo.mockResolvedValueOnce({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    await waitFor(() => {
      expect(mockQueryWMSLayers).toHaveBeenCalledWith(
        `${WMS_URL}SERVICE=WMS&REQUEST=GetCapabilities`,
        true,
      );
    });

    // Before that resolves, switch to an AutoWMS-looking service instead -
    // this clears ogcWMSService back to '' synchronously.
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    await waitForLoadingToFinish();

    // Now let the stale WMS layers response resolve.
    await act(async () => {
      resolveFirstLayers([
        {
          name: 'layer1',
          title: 'Layer One',
          styles: [],
        } as unknown as LayerProps,
      ]);
      await firstLayersPromise;
    });

    expect(screen.queryByText('Layer One')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Layer One')).not.toBeInTheDocument();
  });

  it('shows and hides the layer details popup without adding the layer', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      {
        name: 'layer1',
        title: 'Layer One',
        abstract: 'A detailed layer abstract',
        styles: [{ name: 'default', title: 'Default style' }],
      } as unknown as LayerProps,
    ]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: 'Test abstract',
    } as unknown as WMSServiceInfo);

    const addLayer = jest.fn();
    render(<AutoWMS addLayer={addLayer} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(await screen.findByText(/Layer One/)).toBeInTheDocument();
    expect(
      screen.queryByText('A detailed layer abstract'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Layer details'));

    // Scoped to the readable summary (not the JSON dump alongside it, which
    // repeats the same text and would otherwise match ambiguously too).
    const summary = within(await screen.findByTestId('layer-details-summary'));
    expect(summary.getByText(/A detailed layer abstract/)).toBeInTheDocument();
    expect(summary.getByText(/Default style/)).toBeInTheDocument();
    // Opening the details popup must not also add the layer.
    expect(addLayer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('close'));
    expect(
      screen.queryByText('A detailed layer abstract'),
    ).not.toBeInTheDocument();
  });

  it('loads preview images at most 5 per second', async () => {
    jest.useFakeTimers();
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    const sevenLayers = Array.from({ length: 7 }, (_, i) => ({
      name: `layer${i + 1}`,
      title: `Layer ${i + 1}`,
      styles: [],
    })) as unknown as LayerProps[];
    mockQueryWMSLayers.mockResolvedValue(sevenLayers);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    await waitFor(() => {
      expect(mockQueryWMSLayers).toHaveBeenCalled();
    });

    // All 7 layers are listed, but only the first 5 preview images should
    // actually be loading (real <img> elements) a second in.
    await waitFor(() => {
      expect(screen.getByText(/Layer 7/)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('img')).toHaveLength(5);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(7);
    });
  });

  it('matches a filter whose words appear scattered across the title, not contiguously', async () => {
    // "air press sea" never appears as one literal substring of this title
    // (it's "...air pressure at mean sea..."), but every individual word
    // in the filter does appear somewhere in it - each word matching
    // independently (not the whole phrase as a single substring) is what
    // should find it.
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      {
        name: 'air_pressure_msl',
        title: 'Air Pressure at Mean Sea Level 1 Min Mean (pp)',
        styles: [],
      },
      { name: 'layer2', title: 'Wind Speed', styles: [] },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(
      await screen.findByText('Air Pressure at Mean Sea Level 1 Min Mean (pp)'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter layers'), {
      target: { value: 'air press sea' },
    });

    expect(
      screen.getByText('Air Pressure at Mean Sea Level 1 Min Mean (pp)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Wind Speed')).not.toBeInTheDocument();
  });

  it('filters the layer list by title or name', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      {
        name: 'temperature-2m/nearest',
        title: 'Temperature 2m',
        styles: [],
      },
      { name: 'layer2', title: 'Air pressure', styles: [] },
      {
        name: 'temperature-sfc/nearest',
        title: 'Temperature surface',
        styles: [],
      },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(await screen.findByText('Temperature 2m')).toBeInTheDocument();
    expect(screen.getByText('Air pressure')).toBeInTheDocument();
    expect(screen.getByText('Temperature surface')).toBeInTheDocument();

    const filterInput = screen.getByLabelText('Filter layers');
    fireEvent.change(filterInput, { target: { value: 'Temperature 2m' } });

    expect(screen.getByText('Temperature 2m')).toBeInTheDocument();
    expect(screen.queryByText('Air pressure')).not.toBeInTheDocument();
    expect(screen.queryByText('Temperature surface')).not.toBeInTheDocument();

    // Matching against the layer name too (not just the title) - this one
    // only matches via its name, not its title.
    fireEvent.change(filterInput, { target: { value: 'layer2' } });
    expect(screen.getByText('Air pressure')).toBeInTheDocument();
    expect(screen.queryByText('Temperature 2m')).not.toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: '' } });
    expect(screen.getByText('Temperature 2m')).toBeInTheDocument();
    expect(screen.getByText('Air pressure')).toBeInTheDocument();
    expect(screen.getByText('Temperature surface')).toBeInTheDocument();
  });

  it('shows a no-match message instead of the list when nothing matches the filter', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      { name: 'layer1', title: 'Layer One', styles: [] },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(await screen.findByText('Layer One')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter layers'), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.queryByText('Layer One')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No layers match "nothing matches this"/),
    ).toBeInTheDocument();
  });

  it('clears the filter when a different service is loaded', async () => {
    // Regression guard: a filter left over from a previous service would
    // otherwise silently hide every layer of the newly loaded one.
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      { name: 'layer1', title: 'Layer One', styles: [] },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: WMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(await screen.findByText('Layer One')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter layers'), {
      target: { value: 'Layer One' },
    });
    expect(screen.getByLabelText('Filter layers')).toHaveValue('Layer One');

    mockQueryWMSLayers.mockResolvedValue([
      { name: 'layer2', title: 'A Different Layer', styles: [] },
    ] as unknown as LayerProps[]);
    const otherServiceUrl = 'http://example.com/other-wms?SERVICE=WMS&';
    fireEvent.change(input, { target: { value: otherServiceUrl } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(await screen.findByText('A Different Layer')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter layers')).toHaveValue('');
  });

  it('navigates into a subfolder of the AutoWMS explorer', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({ result: [] });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(await screen.findByText('SubFolder')).toBeInTheDocument();

    fireEvent.click(screen.getByText('SubFolder'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('path=sub'),
      );
    });
    expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
    await waitForLoadingToFinish();
  });

  it('navigates up one level via the full-width button below the header', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({ result: [] });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('SubFolder'));
    await waitFor(() => {
      expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Up one level (full width)' }),
    );

    expect(screen.getByText(/Current path: *$/)).toBeInTheDocument();
  });

  it('navigates up one level when Backspace is pressed outside a text field', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({ result: [] });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('SubFolder'));
    await waitFor(() => {
      expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
    });

    // Nothing focused right now (the click above didn't land on a text
    // field), so document.activeElement is document.body.
    fireEvent.keyDown(document.body, { key: 'Backspace' });

    expect(screen.getByText(/Current path: *$/)).toBeInTheDocument();
  });

  it('does not navigate up when Backspace is pressed while typing in the dataset filter', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({
          result: [{ path: 'sub/leaf1', name: 'Leaf1', leaf: false }],
        });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('SubFolder'));
    await screen.findByText('Leaf1');
    expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();

    const filterInput = screen.getByLabelText('Filter datasets');
    filterInput.focus();
    fireEvent.keyDown(filterInput, { key: 'Backspace' });

    // Still inside "sub" - the shortcut didn't fire while filtering, so
    // this hasn't navigated back up to the root (which would show
    // "SubFolder" instead of "Leaf1").
    expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
    expect(screen.getByText('Leaf1')).toBeInTheDocument();
  });

  it('does not navigate up on Backspace while a different side-panel tab is active', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({ result: [] });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    const { rerender } = render(<AutoWMS addLayer={jest.fn()} isActive />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('SubFolder'));
    await waitFor(() => {
      expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
    });

    rerender(<AutoWMS addLayer={jest.fn()} isActive={false} />);

    fireEvent.keyDown(document.body, { key: 'Backspace' });

    expect(screen.getByText(/Current path: sub/)).toBeInTheDocument();
  });

  it('filters the dataset/folder list by name', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [
            { path: 'temperature', name: 'Temperature', leaf: false },
            { path: 'wind', name: 'Wind Speed', leaf: false },
          ],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(await screen.findByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Wind Speed')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter datasets'), {
      target: { value: 'temp' },
    });

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.queryByText('Wind Speed')).not.toBeInTheDocument();
  });

  it('shows a no-match message instead of the dataset/folder list when nothing matches the filter', async () => {
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'temperature', name: 'Temperature', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(await screen.findByText('Temperature')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter datasets'), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.queryByText('Temperature')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No datasets match "nothing matches this"/),
    ).toBeInTheDocument();
  });

  it('clears the dataset filter when navigating into a subfolder', async () => {
    // Regression guard: a filter left over from the previously browsed
    // folder would otherwise silently hide items of the one just
    // navigated into.
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=sub')) {
        return Promise.resolve({
          result: [{ path: 'sub/inner', name: 'Inner', leaf: false }],
        });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(await screen.findByText('SubFolder')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter datasets'), {
      target: { value: 'SubFolder' },
    });
    expect(screen.getByLabelText('Filter datasets')).toHaveValue('SubFolder');

    fireEvent.click(screen.getByText('SubFolder'));

    expect(await screen.findByText('Inner')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter datasets')).toHaveValue('');
  });

  it("shows the selected dataset's own full path, not doubled up with the folder path", async () => {
    // Regression guard: adaguc-server's getfiles endpoint always returns a
    // full path from the root for every item - including leaves - not a
    // bare filename relative to the current folder (confirmed directly
    // against a real deployment: clicking a dataset inside
    // "/adaguc::datasets" returns e.g.
    // "/adaguc::datasets/10-minute-in-situ-meteorological-observations.xml"
    // as its own "path"). The breadcrumb used to render `path + currentLeaf`
    // assuming currentLeaf was just a suffix, so selecting a leaf showed
    // the parent folder's path twice.
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=/adaguc::datasets')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets/10-minute-in-situ-meteorological-observations.xml',
              name: '10-minute-in-situ-meteorological-observations',
              leaf: true,
              adaguc:
                'https://example.com/adaguc-server/adagucserver?dataset=10-minute-in-situ-meteorological-observations&',
            },
          ],
        });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets',
              name: 'adaguc::datasets',
              leaf: false,
            },
          ],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: '',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('adaguc::datasets'));
    fireEvent.click(
      await screen.findByText('10-minute-in-situ-meteorological-observations'),
    );
    await waitForLoadingToFinish();

    expect(
      screen.getByText(
        'Current path: /adaguc::datasets/10-minute-in-situ-meteorological-observations.xml',
      ),
    ).toBeInTheDocument();
  });

  it('shows the layers of a dataset selected after navigating into a folder, not a blank panel', async () => {
    // Regression guard: clicking a leaf dataset bumps a generation counter
    // to force its own GetCapabilities-fetching effect to re-run even
    // when ogcWMSService ends up the same value as before - but that
    // counter used to be shared with the *folder-listing* effect too.
    // Since autoWMSService (the folder-listing service, as opposed to
    // ogcWMSService, the per-dataset one) is still the non-leaf AutoWMS
    // explorer url at the moment a leaf is clicked, bumping a shared
    // counter also re-ran fetchAutoWMSList - whose own synchronous
    // setOGCWMSService('') reset cleared the service the click handler
    // had just set, one effect later in the same commit. That emptied
    // ogcWMSService again, which re-ran the layers effect a second time
    // with nothing to fetch, bumping ogcServiceRequestIdRef past the
    // value the real (still in-flight) GetCapabilities request was
    // tagged with - so its own guard discarded that real response when
    // it arrived. The panel was left completely blank: no layers, no "No
    // layers match" message, not even the WMS service header/link -
    // exactly as reported against a real deployment.
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=/adaguc::datasets')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets/adaguc.tests.wikgeneric.xml',
              name: 'adaguc.tests.wikgeneric',
              leaf: true,
              adaguc:
                'https://example.com/adaguc-server/adagucserver?dataset=adaguc.tests.wikgeneric&',
            },
          ],
        });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets',
              name: 'adaguc::datasets',
              leaf: false,
            },
          ],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      { name: 'layer1', title: 'Layer One', styles: [] },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: 'Test abstract',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('adaguc::datasets'));
    fireEvent.click(await screen.findByText('adaguc.tests.wikgeneric'));

    expect(await screen.findByText('Layer One')).toBeInTheDocument();
    expect(screen.getByText('Test abstract')).toBeInTheDocument();
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No layers match/)).not.toBeInTheDocument();
  });

  it("keeps showing a dataset's layers after clicking refresh", async () => {
    // Regression guard: refresh() used to always go through
    // fetchAutoWMSList (bumping autoWMSFetchGeneration), which
    // unconditionally resets ogcWMSService to '' as part of navigating to
    // a *different* folder - a side effect that's wrong here, since
    // refreshing while a leaf dataset's layers are shown should reload
    // those same layers, not the (invisible, unrelated) parent folder
    // listing. That reset raced fetchLayersFromOGCWMSService's own
    // freshly-started request for the real layers and got it discarded by
    // ogcServiceRequestIdRef's stale-response guard, so clicking refresh
    // while viewing a dataset's layers silently emptied the panel.
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('path=/adaguc::datasets')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets/adaguc.tests.wikgeneric.xml',
              name: 'adaguc.tests.wikgeneric',
              leaf: true,
              adaguc:
                'https://example.com/adaguc-server/adagucserver?dataset=adaguc.tests.wikgeneric&',
            },
          ],
        });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [
            {
              path: '/adaguc::datasets',
              name: 'adaguc::datasets',
              leaf: false,
            },
          ],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;
    mockQueryWMSLayers.mockResolvedValue([
      { name: 'layer1', title: 'Layer One', styles: [] },
    ] as unknown as LayerProps[]);
    mockQueryWMSServiceInfo.mockResolvedValue({
      abstract: 'Test abstract',
    } as unknown as WMSServiceInfo);

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    fireEvent.click(await screen.findByText('adaguc::datasets'));
    fireEvent.click(await screen.findByText('adaguc.tests.wikgeneric'));

    expect(await screen.findByText('Layer One')).toBeInTheDocument();
    await waitForLoadingToFinish();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Layer One')).toBeInTheDocument();
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No layers match/)).not.toBeInTheDocument();
  });

  it('shows a could-not-reach message, not "No items found.", when the service is unreachable', async () => {
    // Regression guard: a network-level failure (wrong host/port, service
    // down, ...) used to look identical to a service that loaded fine but
    // legitimately has nothing in it - both left `result.result` empty, so
    // the explorer showed the same "No items found." either way. Reported
    // against http://localhost:8080/autowms, a host nothing was listening
    // on.
    const mockFetch = jest.fn((url: string) => {
      if (url === './config.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));

    expect(
      await screen.findByText(
        `Could not reach ${AUTOWMS_URL}request=getfiles&path= - the service could not be reached.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
  });

  it('loads an externally requested service, bypassing manual typing', async () => {
    // Regression guard: the top bar's "custom WMS service" field (see
    // AdagucAppBar/SideToolPanel) can send a service here directly - it
    // must populate the input and fetch it immediately, the same as
    // pressing Enter would.
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    const { rerender } = render(
      <AutoWMS addLayer={jest.fn()} externalServiceRequest={undefined} />,
    );
    await flushConfigFetch(mockFetch);
    mockFetch.mockClear();

    rerender(
      <AutoWMS
        addLayer={jest.fn()}
        externalServiceRequest={{ service: AUTOWMS_URL, requestId: 1 }}
      />,
    );

    expect(screen.getByLabelText('Add AutoWMS or WMS service')).toHaveValue(
      AUTOWMS_URL,
    );
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `${AUTOWMS_URL}request=getfiles&path=`,
      );
    });
    await waitForLoadingToFinish();
  });

  it('does not reload when the same service request is seen again', async () => {
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    const request = { service: AUTOWMS_URL, requestId: 1 };
    const { rerender } = render(
      <AutoWMS addLayer={jest.fn()} externalServiceRequest={request} />,
    );
    await flushConfigFetch(mockFetch);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `${AUTOWMS_URL}request=getfiles&path=`,
      );
    });
    await waitForLoadingToFinish();
    mockFetch.mockClear();

    rerender(<AutoWMS addLayer={jest.fn()} externalServiceRequest={request} />);

    expect(mockFetch).not.toHaveBeenCalledWith(
      `${AUTOWMS_URL}request=getfiles&path=`,
    );
  });

  it('keeps showing the explorer list after re-loading the already-loaded service', async () => {
    // Regression guard: loadAutoWMSService always synchronously resets
    // result/layers to empty before (re-)fetching - but the effect that
    // actually performs that fetch only re-runs when path/autoWMSService
    // actually change value. Re-submitting the exact same already-loaded
    // url (e.g. pressing Enter/Load again) resolves back to that same
    // value, so React used to bail out of re-running the effect entirely,
    // leaving the explorer stuck on "No items found" even though the
    // service loaded fine moments earlier.
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    expect(await screen.findByText('SubFolder')).toBeInTheDocument();

    // Load the exact same url again, e.g. re-pressing Enter/Load, or
    // re-clicking the same link in the top bar.
    fireEvent.click(screen.getByRole('button', { name: 'Load service' }));
    await waitForLoadingToFinish();

    expect(await screen.findByText('SubFolder')).toBeInTheDocument();
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
  });

  it('shows the explorer list when an externally requested service matches the deployment default that already auto-loaded', async () => {
    // Regression guard: this is the exact scenario reported against the
    // live deployment - its own config.json default AutoWMS service is
    // https://geoservices.knmi.nl/autowms?, so a first-time visitor who
    // also pastes/clicks that same url in the top bar hits the race
    // above for real: the mount-time default auto-load and the top bar's
    // externally requested load both resolve to the identical url.
    const DEFAULT_URL = AUTOWMS_URL;
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({ autowmsurl: DEFAULT_URL });
      }
      if (url.includes('request=getfiles')) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    const { rerender } = render(
      <AutoWMS addLayer={jest.fn()} externalServiceRequest={undefined} />,
    );
    // Let the deployment default finish auto-loading first.
    expect(await screen.findByText('SubFolder')).toBeInTheDocument();

    // The user then submits that exact same url from the top bar.
    rerender(
      <AutoWMS
        addLayer={jest.fn()}
        externalServiceRequest={{ service: DEFAULT_URL, requestId: 1 }}
      />,
    );
    await waitForLoadingToFinish();

    expect(await screen.findByText('SubFolder')).toBeInTheDocument();
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
  });

  it('remembers a loaded service in localStorage and shows it as a suggestion', async () => {
    // Same "recent services" history as WMSServiceInput (top bar/"Add
    // data" dialog) - a url loaded here should be just as easy to get back
    // to later, and show up wherever that shared history is used.
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: AUTOWMS_URL } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitForLoadingToFinish();

    expect(
      JSON.parse(window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]'),
    ).toEqual([AUTOWMS_URL]);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.focus(input);
    expect(
      screen.getByRole('option', { name: AUTOWMS_URL }),
    ).toBeInTheDocument();
  });

  it('removes a remembered service when its delete icon is clicked, without loading it', async () => {
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://a/autowms?', 'https://b/autowms?']),
    );
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);
    mockFetch.mockClear();

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.focus(input);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove https://a/autowms? from recent services',
      }),
    );

    expect(
      screen.queryByRole('option', { name: 'https://a/autowms?' }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]'),
    ).toEqual(['https://b/autowms?']);
    // Deleting a recent entry must not also load it.
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('request=getfiles'),
    );
    expect(input).toHaveValue('');
  });

  it('remembers a service loaded straight from the ?autowms= url', async () => {
    // Regression guard: a service set from the page's own url (e.g.
    // https://.../?autowms=http://localhost:8080, opened directly or from
    // a bookmark/shared link) is applied straight to state on mount,
    // bypassing loadAutoWMSService - which is where remembering normally
    // happens - so it never showed up as a suggestion later.
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    const queryServiceUrl = 'http://localhost:8080';
    window.history.pushState(
      {},
      '',
      `http://localhost/?autowms=${encodeURIComponent(queryServiceUrl)}`,
    );
    const mockFetch = makeFetchMock(configJsonHandler);
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    expect(
      JSON.parse(window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]'),
    ).toEqual([queryServiceUrl]);

    window.history.pushState({}, '', 'http://localhost/');
  });

  it('resolves a bare host loaded from the ?autowms= url via the common AutoWMS mount points', async () => {
    // Regression guard: a bare host (e.g. from a shared/bookmarked link,
    // or someone who doesn't know the exact mount path) didn't resolve to
    // anything at all before - this tries it as given, then "/autowms",
    // then "/adaguc-server/autowms", keeping whichever actually looks
    // like a real listing, updating the input and the remembered history
    // to match.
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    const bareUrl = 'http://localhost:8080';
    const resolvedUrl = 'http://localhost:8080/adaguc-server/autowms';
    window.history.pushState(
      {},
      '',
      `http://localhost/?autowms=${encodeURIComponent(bareUrl)}`,
    );
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({});
      }
      if (url === `${resolvedUrl}?request=getfiles&path=`) {
        return Promise.resolve({
          result: [{ path: 'sub', name: 'SubFolder', leaf: false }],
        });
      }
      // The bare host and the plain "/autowms" guess don't look like a
      // real listing here, so resolution should move past both of them.
      return Promise.resolve({ notAListing: true });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    expect(await screen.findByText('SubFolder')).toBeInTheDocument();
    expect(screen.getByLabelText('Add AutoWMS or WMS service')).toHaveValue(
      resolvedUrl,
    );
    expect(
      JSON.parse(window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]'),
    ).toEqual([resolvedUrl]);

    window.history.pushState({}, '', 'http://localhost/');
  });

  it('pins the deployment default AutoWMS endpoint as the first option, without a delete icon', async () => {
    // Same pinned default as WMSServiceInput (top bar/"Add data" dialog) -
    // it's always one click away here too, not just suggested once it
    // happens to already be in the (locally-stored) recent-services
    // history.
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    const DEFAULT_URL = 'https://geoservices.knmi.nl/autowms?';
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://a/autowms?']),
    );
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({ autowmsurl: DEFAULT_URL });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.focus(input);

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent(DEFAULT_URL);
    expect(options[1]).toHaveTextContent('https://a/autowms?');
    expect(
      screen.queryByRole('button', {
        name: `Remove ${DEFAULT_URL} from recent services`,
      }),
    ).not.toBeInTheDocument();
  });

  it('does not duplicate the default AutoWMS endpoint when it is also in recent history', async () => {
    const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
    const DEFAULT_URL = 'https://geoservices.knmi.nl/autowms?';
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify([DEFAULT_URL]),
    );
    const mockFetch = makeFetchMock((url) => {
      if (url === './config.json') {
        return Promise.resolve({ autowmsurl: DEFAULT_URL });
      }
      return Promise.resolve({ result: [] });
    });
    global.fetch = mockFetch;

    render(<AutoWMS addLayer={jest.fn()} />);
    await flushConfigFetch(mockFetch);

    const input = screen.getByLabelText('Add AutoWMS or WMS service');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.focus(input);

    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
