import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installSprites } from './ui/sprites';
import { restoreResourcePack } from './game/core/ResourcePacks';
import { runValidation } from './game/core/Validate';

installSprites();
void restoreResourcePack().catch((error) => console.warn('Resource pack could not be restored', error));
// Registry sanity check. In dev it runs on boot so a bad block/item/recipe shows up immediately;
// in production it stays available on demand as `fableValidate()` in the console.
if (import.meta.env.DEV) { try { runValidation(); } catch (error) { console.error('Registry validation failed', error); } }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
