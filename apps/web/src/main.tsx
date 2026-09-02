import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
// Astryx styles are compiled from source by the astryxStylex() Vite plugin
// (virtual:stylex.css + @layer reset/astryx-base/astryx-theme/product) — the
// published packages ship no CSS files, so nothing to import from them here.
import './styles/product.css';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
