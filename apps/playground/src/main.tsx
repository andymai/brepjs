import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerPreloadErrorRecovery } from './lib/preloadErrorRecovery';
import './styles/globals.css';

registerPreloadErrorRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
