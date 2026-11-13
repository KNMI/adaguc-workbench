import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppDispatch } from '../store/store';
import { thunks } from '../store/thunks';
import WMSServiceInput from './WMSServiceInput';

jest.mock('../store/thunks', () => ({
  thunks: { addLayer: jest.fn() },
}));

jest.mock('../store/store', () => ({
  actions: {
    requestAutoWMSService: (payload: unknown) => ({
      type: 'wmsservices/requestAutoWMSService',
      payload,
    }),
  },
  useAppDispatch: jest.fn(),
}));

const mockUseAppDispatch = jest.mocked(useAppDispatch);
const mockAddLayer = jest.mocked(thunks.addLayer);

const RECENT_SERVICES_KEY = 'adaguc_recent_wms_services';
const PLACEHOLDER = 'Add a custom WMS or AutoWMS service';

const typeAndSubmit = (value: string): void => {
  const input = screen.getByPlaceholderText(PLACEHOLDER);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('WMSServiceInput', () => {
  let mockDispatch: jest.Mock;

  beforeEach(() => {
    window.localStorage.clear();
    mockDispatch = jest.fn();
    // thunks.addLayer is dispatched as a plain thunk here (not unwrapped
    // via the real middleware), so the dispatch result needs its own
    // .unwrap() to chain off, like the real AppThunkDispatch would give.
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    mockUseAppDispatch.mockReturnValue(mockDispatch);
    mockAddLayer.mockImplementation(
      (payload: unknown) =>
        ({ type: 'maps/addLayer', payload }) as unknown as ReturnType<
          typeof thunks.addLayer
        >,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  });

  it('adds a service=wms url as a layer, without probing', async () => {
    render(<WMSServiceInput />);

    typeAndSubmit('http://example.com/wms?SERVICE=WMS&');

    expect(mockAddLayer).toHaveBeenCalledWith({
      mapId: 'map1',
      serviceUrl: 'http://example.com/wms?SERVICE=WMS&',
      name: undefined,
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue(''),
    );
  });

  it('shows why a service could not be added as a layer', async () => {
    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.reject(
          // The serialized form a rejected thunk's error arrives in.
          new Error(
            "http://example.com/wms?SERVICE=WMS& doesn't list any layers to add.",
          ),
        ),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<WMSServiceInput />);

    typeAndSubmit('http://example.com/wms?SERVICE=WMS&');

    expect(
      await screen.findByText(
        "http://example.com/wms?SERVICE=WMS& doesn't list any layers to add.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('routes an AutoWMS-looking url to the AutoWMS panel, without probing', () => {
    // Regression guard: AutoWMS explorer endpoints are plain file-listing
    // services, not OGC WMS ones, so they can't be added as a map layer.
    render(<WMSServiceInput />);

    typeAndSubmit('https://plieger-Precision-5680//autowms?');

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'wmsservices/requestAutoWMSService',
      payload: { service: 'https://plieger-Precision-5680//autowms?' },
    });
    expect(mockAddLayer).not.toHaveBeenCalled();
  });

  it('does nothing when the field is empty', () => {
    render(<WMSServiceInput />);

    typeAndSubmit('');

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockAddLayer).not.toHaveBeenCalled();
  });

  it('guesses the missing "autowms" suffix, tries that, and loads it there when that looks right', async () => {
    // Regression guard: a url missing both service=wms and an "autowms"
    // suffix (e.g. someone forgot to add it) used to always be added as a
    // WMS layer - it should be tried as AutoWMS first, by guessing the
    // corrected url (with the suffix appended), not the bare one typed.
    // The bare url itself doesn't look like a real listing (no `result`),
    // so resolution moves on to the next candidate instead of stopping
    // there.
    const mockFetch = jest.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            url.includes('/autowms?') ? { result: [] } : { notAListing: true },
          ),
      }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<WMSServiceInput />);
    typeAndSubmit('https://plieger-Precision-5680/');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'https://plieger-Precision-5680/autowms?request=getfiles&path=',
      );
    });
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'wmsservices/requestAutoWMSService',
        payload: { service: 'https://plieger-Precision-5680/autowms' },
      });
    });
    expect(mockAddLayer).not.toHaveBeenCalled();
  });

  it('inserts a slash before the guessed "autowms" suffix when the url has none', async () => {
    const mockFetch = jest.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            url.includes('/autowms?') ? { result: [] } : { notAListing: true },
          ),
      }),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<WMSServiceInput />);
    typeAndSubmit('https://plieger-Precision-5680');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'https://plieger-Precision-5680/autowms?request=getfiles&path=',
      );
    });
  });

  it('falls back to adding the layer when the ambiguous url does not look like AutoWMS', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('not json'));
    global.fetch = mockFetch;

    render(<WMSServiceInput />);
    typeAndSubmit('http://example.com/some/service?');

    await waitFor(() => {
      expect(mockAddLayer).toHaveBeenCalledWith({
        mapId: 'map1',
        serviceUrl: 'http://example.com/some/service?',
        name: undefined,
      });
    });
  });

  it('remembers a successfully handled service in localStorage, most recent first', async () => {
    render(<WMSServiceInput />);

    typeAndSubmit('https://a/autowms?');
    typeAndSubmit('https://b/autowms?');

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]',
      );
      expect(stored).toEqual(['https://b/autowms?', 'https://a/autowms?']);
    });
  });

  it('de-duplicates a re-added service by moving it to the front instead of repeating it', async () => {
    render(<WMSServiceInput />);

    typeAndSubmit('https://a/autowms?');
    typeAndSubmit('https://b/autowms?');
    typeAndSubmit('https://a/autowms?');

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]',
      );
      expect(stored).toEqual(['https://a/autowms?', 'https://b/autowms?']);
    });
  });

  it('caps the remembered history at 30 services', async () => {
    const existing = Array.from(
      { length: 30 },
      (_, i) => `https://service-${i}/autowms?`,
    );
    window.localStorage.setItem(RECENT_SERVICES_KEY, JSON.stringify(existing));

    render(<WMSServiceInput />);
    typeAndSubmit('https://new-service/autowms?');

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]',
      );
      expect(stored).toHaveLength(30);
      expect(stored[0]).toBe('https://new-service/autowms?');
      expect(stored).not.toContain('https://service-29/autowms?');
    });
  });

  it('shows the remembered services as options when the field is focused', () => {
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://a/autowms?', 'https://b/autowms?']),
    );

    render(<WMSServiceInput />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.focus(input);

    expect(
      screen.getByRole('option', { name: 'https://a/autowms?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'https://b/autowms?' }),
    ).toBeInTheDocument();
  });

  it('removes a remembered service when its delete icon is clicked, without selecting it', () => {
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://a/autowms?', 'https://b/autowms?']),
    );

    render(<WMSServiceInput />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.focus(input);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove https://a/autowms? from recent services',
      }),
    );

    // Removed from the dropdown and from storage...
    expect(
      screen.queryByRole('option', { name: 'https://a/autowms?' }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(RECENT_SERVICES_KEY) || '[]'),
    ).toEqual(['https://b/autowms?']);
    // ...and clicking delete must not also select/submit it.
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockAddLayer).not.toHaveBeenCalled();
    expect(input).toHaveValue('');

    // The other entry is untouched.
    expect(
      screen.getByRole('option', { name: 'https://b/autowms?' }),
    ).toBeInTheDocument();
  });

  it('calls onHandled once a service has been successfully routed', () => {
    const onHandled = jest.fn();
    render(<WMSServiceInput onHandled={onHandled} />);

    typeAndSubmit('https://plieger-Precision-5680//autowms?');

    expect(onHandled).toHaveBeenCalledTimes(1);
  });

  it('pins the deployment default AutoWMS endpoint as the first option, without a delete icon', async () => {
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://a/autowms?']),
    );
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ autowmsurl: 'https://geoservices.knmi.nl/autowms?' }),
    });

    render(<WMSServiceInput />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    await waitFor(() => {
      fireEvent.focus(input);
      expect(
        screen.getByRole('option', {
          name: 'https://geoservices.knmi.nl/autowms?',
        }),
      ).toBeInTheDocument();
    });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent(
      'https://geoservices.knmi.nl/autowms?',
    );
    expect(options[1]).toHaveTextContent('https://a/autowms?');

    // The pinned default isn't part of the (locally-stored) recent list,
    // so it can't be removed the same way a real recent entry can.
    expect(
      screen.queryByRole('button', {
        name: 'Remove https://geoservices.knmi.nl/autowms? from recent services',
      }),
    ).not.toBeInTheDocument();
  });

  it('does not duplicate the default AutoWMS endpoint when it is also in recent history', async () => {
    window.localStorage.setItem(
      RECENT_SERVICES_KEY,
      JSON.stringify(['https://geoservices.knmi.nl/autowms?']),
    );
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ autowmsurl: 'https://geoservices.knmi.nl/autowms?' }),
    });

    render(<WMSServiceInput />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    await waitFor(() => {
      fireEvent.focus(input);
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
  });
});
