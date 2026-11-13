import * as React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import AdagucCreatePermalinkDialog from './AdagucCreatePermalinkDialog';
import { makePermaLink } from './handleWindowLocationQueryString';
import { emptyMap, renderWithStore } from '../testUtils/renderWithStore';

// The real store, holding a map with its own (distinctive) view - so the
// dialog has to share the permalink for exactly that map.
const map = emptyMap({
  view: { srs: 'EPSG:4326', bbox: { left: 1, bottom: 2, right: 3, top: 4 } },
});
// The test store has no base maps/overlays (see renderWithStore).
const PERMALINK = makePermaLink(map, []);

const renderDialog = () =>
  renderWithStore(
    <AdagucCreatePermalinkDialog isDialogOpen onDialogOpen={jest.fn()} />,
    { map1: map },
  );

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

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    expect(PERMALINK).toContain('srs=EPSG%3A4326&bbox=1,2,3,4');
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

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    // Lets the rejected promise's .catch handler run.
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to a menu of common share targets when the Web Share API is unavailable', () => {
    renderDialog();

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
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(screen.getByRole('menuitem', { name: /Email/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /Email/ }));

    expect(
      screen.queryByRole('menuitem', { name: /Email/ }),
    ).not.toBeInTheDocument();
  });
});
