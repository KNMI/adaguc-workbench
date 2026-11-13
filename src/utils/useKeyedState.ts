import * as React from 'react';

// Like useState, but the value goes back to `initial` whenever `key`
// changes - e.g. a filter that belongs to whichever folder is shown, and
// so shouldn't carry over to the next one. The reset happens as part of
// rendering with the new key, rather than in an effect afterwards, so
// nothing ever renders the old value against the new key.
export const useKeyedState = <T>(
  initial: T,
  key: string,
): [T, (value: T) => void] => {
  const [state, setState] = React.useState({ key, value: initial });
  const value = state.key === key ? state.value : initial;
  const setValue = React.useCallback(
    (newValue: T) => setState({ key, value: newValue }),
    [key],
  );
  return [value, setValue];
};
