import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { api, flushPendingEnds } from './api.ts';
import { detectLocale } from './i18n.ts';
import { presence } from './presence.ts';
import './styles.css';

// Results saved offline go out before anything else, so a candle that ended is never mistaken for one that vanished.
await flushPendingEnds();
const me = await api.me().catch(() => null);
presence.connect();
window.addEventListener('online', () => { flushPendingEnds(); });

const engine = await import('./engine/index.ts');
createRoot(document.getElementById('root')!).render(<App initialLocale={me?.locale ?? detectLocale()} />);
requestAnimationFrame(() => setTimeout(() => engine.boot(), 0));
await engine.ready;
(window as unknown as { __ready: boolean }).__ready = true;
