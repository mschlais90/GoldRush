import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { store } from './ui/store';
import './styles.css';

// Dev-only handle for poking at the game from the console.
if (import.meta.env.DEV) (window as unknown as { gr: typeof store }).gr = store;

createRoot(document.getElementById('root')!).render(<App />);
