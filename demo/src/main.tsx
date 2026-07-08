import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Note: intentionally NOT wrapped in <React.StrictMode>. We create long-lived
// ServerClock instances (with event listeners) and dispose them on unmount;
// StrictMode's dev-only mount/unmount/mount cycle would dispose them before the
// initial sync completes. The library itself is StrictMode-safe when it owns
// the clock (see useServerCountdown) — this demo just owns the clocks itself.
createRoot(document.getElementById('root')!).render(<App />);
