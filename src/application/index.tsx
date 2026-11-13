import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The app's one typeface (see appTheme.tsx), bundled rather than relying on
// it being installed: Roboto for everything, Roboto Mono only for raw text
// dumps (JSON, ncdump output) where aligned columns help.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto-mono/400.css';

const container = document.getElementById('app');
if (!container) {
  throw new Error('index.html is missing the #app element to render into');
}
const root = createRoot(container);
root.render(<App />);
