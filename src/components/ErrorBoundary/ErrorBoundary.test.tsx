import type { MockInstance } from 'vitest';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Bomb = (): React.ReactElement => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error; keep test output clean.
  let consoleErrorSpy: MockInstance;
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary fallbackMessage="Layer unavailable">
        <div>content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders the fallback message instead of crashing when a child throws', () => {
    render(
      <ErrorBoundary fallbackMessage="Layer unavailable">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Layer unavailable')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows a remove button in the fallback when onRemove is given, and calls it on click', () => {
    // Regression guard: the whole point of catching the error here is
    // that the broken item's own UI - including its normal remove button
    // - never rendered at all. Without this, there was no way left to get
    // rid of it (e.g. a layer whose own selector throws on every render).
    const onRemove = vi.fn();
    render(
      <ErrorBoundary fallbackMessage="Layer unavailable" onRemove={onRemove}>
        <Bomb />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove layer' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not show a remove button in the fallback when onRemove is not given', () => {
    render(
      <ErrorBoundary fallbackMessage="Layer unavailable">
        <Bomb />
      </ErrorBoundary>,
    );

    expect(
      screen.queryByRole('button', { name: 'Remove layer' }),
    ).not.toBeInTheDocument();
  });

  it('calls onError with the thrown error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallbackMessage="Layer unavailable" onError={onError}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'boom',
      }),
    );
  });
});
