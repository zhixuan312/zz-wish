import type { Locale, PlaceId } from '../../shared/places.ts';
import type { Shape } from '../../shared/rules.ts';

export type Status = 'burning' | 'burned_down' | 'went_out' | 'ended_unexpectedly';
export type EndReason = 'left' | 'navigated' | 'put_out' | 'complete';
export interface Candle {
  id: string; wishId: string; wish: string; placeId: PlaceId; shape: Shape; durationMs: number; status: Status;
  startedAt: number; endedAt: number | null; burnedMs: number; endReason: string | null;
}
export interface Totals { candles: number; totalMs: number; burnedDown: number; wentOut: number; unexpected: number }
export interface PlaceStat { placeId: PlaceId; now: number; people: number; candles: number; totalMs: number; averageMs: number; longestMs: number }
export interface Stats { now: number; people: number; totalMs: number; places: PlaceStat[] }
export interface WishSummary { id: string; text: string; candles: number; totalMs: number }

export class ApiError extends Error { code: string; status: number; constructor(status: number, code: string) { super(code); this.status = status; this.code = code; } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'error');
  return res.json() as Promise<T>;
}

export const api = {
  me: () => call<{ locale: Locale | null; totals: Totals }>('/api/me'),
  setLocale: (locale: Locale) => call('/api/me/locale', { method: 'PUT', body: JSON.stringify({ locale }) }),
  light: (body: { runId: string; placeId: PlaceId; shape: Shape; wishId?: string; wishText?: string }) =>
    call<Candle>('/api/candles', { method: 'POST', keepalive: true, body: JSON.stringify(body) }),
  myCandles: (signal?: AbortSignal) => call<{ candles: Candle[]; totals: Totals }>('/api/me/candles', { signal }),
  myWishes: () => call<{ wishes: WishSummary[] }>('/api/me/wishes'),
  stats: () => call<Stats>('/api/places/stats'),
};

// Final results are queued locally until the server confirms them, so a short offline spell loses nothing.
interface PendingEnd { candleId: string | null; runId: string; reason: EndReason; burnedMs: number }
const KEY = 'yz.pendingEnds';
const readQueue = (): PendingEnd[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const writeQueue = (q: PendingEnd[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage unavailable */ } };

async function sendEnd(e: PendingEnd): Promise<Candle | null> {
  try {
    const res = await fetch(e.candleId ? `/api/candles/${e.candleId}/end` : `/api/runs/${e.runId}/end`, {
      method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: e.runId, reason: e.reason, burnedMs: Math.floor(e.burnedMs) }),
    });
    if (res.ok || (res.status === 404 && e.candleId)) { writeQueue(readQueue().filter((x) => x.runId !== e.runId)); return res.ok ? res.json() : null; }
  } catch { /* offline: stays queued */ }
  return null;
}

export function reportEnd(e: PendingEnd): Promise<Candle | null> {
  writeQueue([...readQueue().filter((x) => x.runId !== e.runId), e]);
  return sendEnd(e);
}

export async function flushPendingEnds() { for (const e of readQueue()) await sendEnd(e); }
