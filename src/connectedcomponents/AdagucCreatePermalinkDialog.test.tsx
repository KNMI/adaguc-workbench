import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdagucCreatePermalinkDialog from './AdagucCreatePermalinkDialog';

// AdagucCreatePermalinkDialog's own real imports (useAppSelector from the
// store, makePermaLink) pull in @opengeoweb/webmap, an ESM-only package
// Jest can't parse as-is - not what these tests are about, so both are
// stubbed directly instead.
jest.mock('../store/store', () => ({
  useAppSelector: jest.fn(() => undefined),
}));
jest.mock('./handleWindowLocationQueryString', () => ({
  makePermaLink: jest.fn(
    () => 'http://localhost/?srs=EPSG%3A3857&bbox=-1,-1,1,1',
  ),
}));

const PERMALINK = 'http://localhost/?srs=EPSG%3A3857&bbox=-1,-1,1,1';

describe('AdagucCreatePermalinkDialog', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).share;
  });

  it('invokes the native Web Share API directly when the browser supports it, without showing a fallback menu', () => {
    const mockShare = jest.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).share = mockShare;

    render(
      <AdagucCreatePermalinkDialog isDialogOpen onDialogOpen={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    expect(mockShare).toHaveBeenCalledWith({
      title: 'Adaguc Workbench',
      url: PERMALINK,
    });
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('silently ignores the user cancelling the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), {
      name: 'AbortError',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).share = jest.fn().mockRejectedValue(abortError);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <AdagucCreatePermalinkDialog isDialogOpen onDialogOpen={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    // Lets the rejected promise's .catch handler run.
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to a menu of common share targets when the Web Share API is unavailable', () => {
    render(
      <AdagucCreatePermalinkDialog isDialogOpen onDialogOpen={jest.fn()} />,
    );

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(navigator.share).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    const emailLink = screen.getByRole('menuitem', { name: /Email/ });
    expect(emailLink).toHaveAttribute(
      'href',
      `mailto:?subject=${encodeURIComponent(
        'Adaguc Workbench',
      )}&body=${encodeURIComponent(PERMALINK)}`,
    );

    const whatsAppLink = screen.getByRole('menuitem', { name: /WhatsApp/ });
    expect(whatsAppLink).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encodeURIComponent(PERMALINK)}`,
    );

    const twitterLink = screen.getByRole('menuitem', { name: /Twitter/ });
    expect(twitterLink).toHaveAttribute(
      'href',
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(PERMALINK)}`,
    );
  });

  it('closes the fallback menu after picking a share target', () => {
    render(
      <AdagucCreatePermalinkDialog isDialogOpen onDialogOpen={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(screen.getByRole('menuitem', { name: /Email/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /Email/ }));

    expect(
      screen.queryByRole('menuitem', { name: /Email/ }),
    ).not.toBeInTheDocument();
  });
});
