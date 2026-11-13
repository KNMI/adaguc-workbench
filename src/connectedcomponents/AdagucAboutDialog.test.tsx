import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdagucAboutDialog from './AdagucAboutDialog';

describe('AdagucAboutDialog', () => {
  it('renders nothing when closed', () => {
    render(<AdagucAboutDialog isDialogOpen={false} onDialogOpen={jest.fn()} />);

    expect(
      screen.queryByText('About Adaguc Workbench'),
    ).not.toBeInTheDocument();
  });

  it('shows the target audience and a link to the GitHub repo when open', () => {
    render(<AdagucAboutDialog isDialogOpen onDialogOpen={jest.fn()} />);

    expect(screen.getByText('About Adaguc Workbench')).toBeInTheDocument();
    expect(
      screen.getByText(/meant to use with Adaguc-Server WMS services/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Developers/)).toBeInTheDocument();
    expect(screen.getByText(/Researchers/)).toBeInTheDocument();
    expect(
      screen.getByText(/People developing new WMS layers/),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', {
      name: /github.com\/KNMI\/adaguc-workbench/,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/KNMI/adaguc-workbench',
    );
    expect(link).toHaveAttribute('target', '_blank');

    const serverLink = screen.getByRole('link', {
      name: /github.com\/KNMI\/adaguc-server/,
    });
    expect(serverLink).toHaveAttribute(
      'href',
      'https://github.com/KNMI/adaguc-server',
    );
    expect(serverLink).toHaveAttribute('target', '_blank');
  });

  it('shows the build date, injected by webpack at build time', () => {
    // jest.config.js stands in for webpack's DefinePlugin substitution
    // with a fixed sentinel value, since jest never runs webpack itself.
    render(<AdagucAboutDialog isDialogOpen onDialogOpen={jest.fn()} />);

    expect(
      screen.getByText(
        `Built on ${new Date('1970-01-01T00:00:00.000Z').toLocaleString()}`,
      ),
    ).toBeInTheDocument();
  });

  it('closes when the close button is clicked', () => {
    const onDialogOpen = jest.fn();
    render(<AdagucAboutDialog isDialogOpen onDialogOpen={onDialogOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(onDialogOpen).toHaveBeenCalledWith(false);
  });
});
