// Stylesheets first: tokens + legacy rules, then the components (TASK_036).
import './styles.css';
import './ui/ui.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './registerSW';

const root = createRoot(document.getElementById('root')!);

// Component showcase (TASK_036): dev server only, at `#/ui`. The branch is
// removed from production builds (`import.meta.env.DEV` is `false` there), so
// the showcase is neither bundled nor precached.
if (import.meta.env.DEV && window.location.hash === '#/ui') {
  void import('./ui/Showcase').then(({ Showcase }) =>
    root.render(
      <StrictMode>
        <Showcase />
      </StrictMode>
    )
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

registerServiceWorker();
