import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {useCadenceStore} from './store/useCadenceStore';
import './index.css';

// Dev-only handle for auditing the workspace in tooling; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__cadence = {store: useCadenceStore};
}

createRoot(document.getElementById('root')!).render(<App />);
