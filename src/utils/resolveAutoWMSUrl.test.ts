import { resolveAutoWMSUrl } from './resolveAutoWMSUrl';

describe('resolveAutoWMSUrl', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
  });

  it('uses the given url unchanged when it already looks like a real listing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: [] }),
    });
    globalThis.fetch = mockFetch;

    await expect(resolveAutoWMSUrl('http://host/autowms')).resolves.toBe(
      'http://host/autowms',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls through to the "autowms" suffix when the bare url does not look like a listing', async () => {
    const mockFetch = vi.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            url === 'http://host/autowms?request=getfiles&path='
              ? { result: [] }
              : { notAListing: true },
          ),
      }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(resolveAutoWMSUrl('http://host')).resolves.toBe(
      'http://host/autowms',
    );
  });

  it('falls through to the "adaguc-server/autowms" suffix when neither the bare url nor "autowms" work', async () => {
    const mockFetch = vi.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            url === 'http://host/adaguc-server/autowms?request=getfiles&path='
              ? { result: [] }
              : { notAListing: true },
          ),
      }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(resolveAutoWMSUrl('http://host')).resolves.toBe(
      'http://host/adaguc-server/autowms',
    );
  });

  it('returns undefined when none of the candidates look like a real listing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ notAListing: true }),
    });
    globalThis.fetch = mockFetch;

    await expect(resolveAutoWMSUrl('http://host')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('keeps trying the remaining candidates when a request fails outright', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ notAListing: true }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ result: [] }),
      });
    globalThis.fetch = mockFetch;

    await expect(resolveAutoWMSUrl('http://host')).resolves.toBe(
      'http://host/adaguc-server/autowms',
    );
  });

  it('strips a trailing slash before appending a suffix', async () => {
    const mockFetch = vi.fn((url: string) =>
      Promise.resolve({
        json: () =>
          Promise.resolve(
            url === 'http://host/autowms?request=getfiles&path='
              ? { result: [] }
              : { notAListing: true },
          ),
      }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(resolveAutoWMSUrl('http://host/')).resolves.toBe(
      'http://host/autowms',
    );
  });
});
