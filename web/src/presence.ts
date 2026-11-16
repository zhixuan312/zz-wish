// One WebSocket for live presence. Before lighting it only listens; with a burning candle it sends heartbeats.
import type { PlaceId } from '../../shared/places.ts';

type Listener = (e: { type: 'count'; placeId: PlaceId; now: number } | { type: 'lit'; placeId: PlaceId } | { type: 'status'; online: boolean }) => void;

const HEARTBEAT_MS = 10_000;

class Presence {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private state: { placeId: PlaceId | null; candleId: string | null; burned: () => number } = { placeId: null, candleId: null, burned: () => 0 };
  private beat = 0;
  online = false;

  connect() {
    if (this.ws) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/presence`);
    this.ws = ws;
    ws.onopen = () => { this.online = true; this.emit({ type: 'status', online: true }); this.sync(); };
    ws.onmessage = (m) => { try { this.emit(JSON.parse(m.data)); } catch { /* ignore */ } };
    ws.onclose = () => {
      this.ws = null; this.online = false; this.emit({ type: 'status', online: false });
      setTimeout(() => this.connect(), 3000);
    };
  }

  on(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit(e: Parameters<Listener>[0]) { for (const l of this.listeners) l(e); }
  private send(msg: object) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }

  private sync() {
    if (this.state.candleId) this.send({ type: 'burn', candleId: this.state.candleId });
    else if (this.state.placeId) this.send({ type: 'watch', placeId: this.state.placeId });
  }

  watch(placeId: PlaceId) { this.stopBurning(); this.state.placeId = placeId; this.sync(); }

  burn(placeId: PlaceId, candleId: string, burned: () => number) {
    this.state = { placeId, candleId, burned };
    this.sync();
    clearInterval(this.beat);
    this.beat = window.setInterval(() => this.send({ type: 'beat', burnedMs: Math.floor(this.state.burned()) }), HEARTBEAT_MS);
  }

  stopBurning() {
    clearInterval(this.beat);
    if (this.state.candleId) { this.state.candleId = null; this.send({ type: 'stop' }); }
  }
}

export const presence = new Presence();
