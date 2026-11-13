import { Provider } from 'react-redux';
import * as React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { wmsQueryClient } from '@opengeoweb/webmap';
import store from '../src/store/store';
import AddDataComponent from '../src/connectedcomponents/AddDataComponent';
import ReduxMap from '../src/connectedcomponents/ReduxMap';
import { AppThemeProvider } from '../src/application/appTheme';

export const ReduxMapStory = (): React.ReactElement => {
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

ReduxMapStory.storyName = 'ReduxMapStory';

export const AddData = (): React.ReactElement => {
  return (
    <AppThemeProvider>
      <QueryClientProvider client={wmsQueryClient}>
        <Provider store={store}>
          <AddDataComponent handleAddData={() => {}} />
        </Provider>
      </QueryClientProvider>
    </AppThemeProvider>
  );
};

AddData.storyName = 'AddData';

export default {
  title: 'ReduxStoreTest',
};
