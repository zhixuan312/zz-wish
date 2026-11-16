// Live presence: who is burning a candle at which place right now.
// Only sockets with a burning candle and a current heartbeat are counted.
export const HEARTBEAT_MS = 10_000;
export const STALE_MS = 30_000;

interface Peer { send: (msg: object) => void; visitorId: string; placeId: string | null; candleId: string | null; lastBeat: number }

export class PresenceHub {
  private peers = new Set<Peer>();
  private now: () => number;
  constructor(now: () => number) { this.now = now; }

  add(visitorId: string, send: (msg: object) => void): Peer {
    const peer: Peer = { send, visitorId, placeId: null, candleId: null, lastBeat: 0 };
    this.peers.add(peer);
    return peer;
  }

  remove(peer: Peer) {
    this.peers.delete(peer);
    if (peer.placeId) this.broadcastCount(peer.placeId);
  }

  watch(peer: Peer, placeId: string) {
    const before = peer.placeId;
    peer.placeId = placeId;
    peer.candleId = null;
    if (before && before !== placeId) this.broadcastCount(before);
    peer.send({ type: 'count', placeId, now: this.count(placeId) });
  }

  burn(peer: Peer, placeId: string, candleId: string) {
    peer.placeId = placeId;
    peer.candleId = candleId;
    peer.lastBeat = this.now();
    this.broadcastCount(placeId);
    for (const p of this.peers) if (p !== peer && p.placeId === placeId && p.visitorId !== peer.visitorId) p.send({ type: 'lit', placeId });
  }

  beat(peer: Peer) { peer.lastBeat = this.now(); }

  stop(peer: Peer) {
    peer.candleId = null;
    if (peer.placeId) this.broadcastCount(peer.placeId);
  }

  private live(p: Peer) { return p.candleId !== null && this.now() - p.lastBeat <= STALE_MS; }

  count(placeId: string): number {
    const visitors = new Set<string>();
    for (const p of this.peers) if (p.placeId === placeId && this.live(p)) visitors.add(p.visitorId);
    return visitors.size;
  }

  countAll(): number {
    const visitors = new Set<string>();
    for (const p of this.peers) if (this.live(p)) visitors.add(p.visitorId);
    return visitors.size;
  }

  isLive(candleId: string): boolean {
    for (const p of this.peers) if (p.candleId === candleId && this.live(p)) return true;
    return false;
  }

  broadcastCount(placeId: string) {
    const now = this.count(placeId);
    for (const p of this.peers) if (p.placeId === placeId) p.send({ type: 'count', placeId, now });
  }

  // Periodic sweep so stale peers drop out of every place's count.
  sweep() {
    const places = new Set<string>();
    for (const p of this.peers) if (p.placeId) places.add(p.placeId);
    for (const id of places) this.broadcastCount(id);
  }
}
