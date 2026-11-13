import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { wmsQueryClient } from '@opengeoweb/webmap';
import React from 'react';
import store from '../store/store';
import ReduxMap from '../connectedcomponents/ReduxMap';
import { AppThemeProvider } from './appTheme';

const App = (): React.ReactElement => {
  // Note: The used config variable is a global var defined in index.html
  return (
    <AppThemeProvider>
      <QueryClientProvider client={wmsQueryClient}>
        <Provider store={store}>
          <ReduxMap />
        </Provider>
      </QueryClientProvider>
    </AppThemeProvider>
  );
};

export default App;
