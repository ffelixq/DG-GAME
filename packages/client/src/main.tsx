import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './ui/ui.css';
import { App } from './App';
import { ConnectionProvider } from './net/connection';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ConnectionProvider>
      <App />
    </ConnectionProvider>
  </StrictMode>,
);
