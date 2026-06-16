import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerPreloadErrorRecovery } from './lib/preloadErrorRecovery';
import { initPostHog } from './lib/posthog';
import './styles/globals.css';

registerPreloadErrorRecovery();
initPostHog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
