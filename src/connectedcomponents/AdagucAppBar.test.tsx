import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdagucAppBar from './AdagucAppBar';

vi.mock('./AdagucAddDataDialog', () => ({
  default: () => null,
}));
vi.mock('./AdagucCreatePermalinkDialog', () => ({
  default: ({ isDialogOpen }: { isDialogOpen: boolean }) =>
    isDialogOpen ? <div data-testid="permalink-dialog" /> : null,
}));
vi.mock('./PredefinedAreasDialog', () => ({
  default: ({ isDialogOpen }: { isDialogOpen: boolean }) =>
    isDialogOpen ? <div data-testid="predefined-areas-dialog" /> : null,
}));

// The service-url routing/history logic itself lives in, and is fully
// covered by, WMSServiceInput.test.tsx - here, only that AdagucAppBar
// actually renders it is under test.
vi.mock('./WMSServiceInput', () => ({
  default: () => <div data-testid="wms-service-input" />,
}));

describe('AdagucAppBar', () => {
  it('renders the shared WMS/AutoWMS service input', () => {
    render(<AdagucAppBar />);

    expect(screen.getByTestId('wms-service-input')).toBeInTheDocument();
  });

  it('opens the predefined areas dialog from its toolbar button', () => {
    render(<AdagucAppBar />);

    expect(
      screen.queryByTestId('predefined-areas-dialog'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Predefined areas' }));

    expect(screen.getByTestId('predefined-areas-dialog')).toBeInTheDocument();
  });

  it('opens the permalink dialog from its own, distinctly-labelled toolbar button', () => {
    // Regression guard: this button and the "Add data" one both used the
    // generic aria-label "menu", an accessibility bug (two controls with
    // the same accessible name) that also made this button impossible to
    // target by its own role/name in a test.
    render(<AdagucAppBar />);

    expect(screen.queryByTestId('permalink-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share permalink' }));

    expect(screen.getByTestId('permalink-dialog')).toBeInTheDocument();
  });

  it('shows the logo on the right of the toolbar, which opens the about dialog', () => {
    render(<AdagucAppBar />);

    expect(
      screen.queryByText('About Adaguc Workbench'),
    ).not.toBeInTheDocument();

    const toolbarButtons = screen.getAllByRole('button');
    // The logo button is the last toolbar control, after the permalink one.
    expect(toolbarButtons[toolbarButtons.length - 1]).toHaveAccessibleName(
      'About Adaguc Workbench',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'About Adaguc Workbench' }),
    );

    expect(screen.getByText('About Adaguc Workbench')).toBeInTheDocument();
  });
});
