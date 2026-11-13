import * as React from 'react';

// `value`, but only once it has stopped changing for `delayMs` - every
// change within that window restarts the wait. Starts out as the initial
// value straight away. Meant for primitives (or other values that keep
// their identity between renders): a new object every render would keep
// restarting the wait forever.
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);
  return debounced;
};
