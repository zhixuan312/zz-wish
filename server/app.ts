import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { openDb } from './db.ts';
import { PresenceHub, HEARTBEAT_MS } from './presence.ts';
import { PLACE_IDS, placeById } from '../shared/places.ts';
import { RULE_VERSION, isAllowedMinutes, shapeMinutes, shapeSchema } from '../shared/rules.ts';

const COOKIE = 'yz_id';
const TEN_YEARS_S = 10 * 365 * 24 * 3600;
const END_SLACK_MS = 5_000; // network and clock slack when the client reports burned time
const BURN_DOWN_TOLERANCE_MS = 1_500;

export interface AppOptions { dbFile: string; now?: () => number; logger?: boolean }

interface CandleRow {
  id: string; visitor_id: string; wish_id: string; wish_snapshot: string; place_id: string; shape: string; duration_ms: number;
  status: string; started_at: number; ended_at: number | null; burned_ms: number; end_reason: string | null; run_id: string;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export function publicCandle(c: CandleRow) {
  return {
    id: c.id, wishId: c.wish_id, wish: c.wish_snapshot, placeId: c.place_id, shape: JSON.parse(c.shape), durationMs: c.duration_ms,
    status: c.status, startedAt: c.started_at, endedAt: c.ended_at, burnedMs: c.burned_ms, endReason: c.end_reason,
  };
}

export async function buildApp(opts: AppOptions) {
  const now = opts.now ?? Date.now;
  const db = openDb(opts.dbFile);
  const hub = new PresenceHub(now);
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cookie);
  await app.register(websocket);
  app.addHook('onClose', async () => db.close());

  const q = {
    visitorByHash: db.prepare<[string], { id: string; locale: string | null }>('SELECT id, locale FROM visitors WHERE credential_hash = ?'),
    insertVisitor: db.prepare('INSERT INTO visitors (id, credential_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)'),
    touchVisitor: db.prepare('UPDATE visitors SET last_seen_at = ? WHERE id = ?'),
    setLocale: db.prepare('UPDATE visitors SET locale = ? WHERE id = ?'),
    burningOf: db.prepare<[string], CandleRow>("SELECT * FROM candles WHERE visitor_id = ? AND status = 'burning'"),
    candle: db.prepare<[string, string], CandleRow>('SELECT * FROM candles WHERE id = ? AND visitor_id = ?'),
    candleByRun: db.prepare<[string, string], CandleRow>('SELECT * FROM candles WHERE visitor_id = ? AND run_id = ?'),
    wish: db.prepare<[string, string], { id: string; text: string }>('SELECT id, text FROM wishes WHERE id = ? AND visitor_id = ?'),
    insertWish: db.prepare('INSERT INTO wishes (id, visitor_id, text, created_at) VALUES (?, ?, ?, ?)'),
    insertCandle: db.prepare(`INSERT INTO candles (id, visitor_id, wish_id, wish_snapshot, place_id, shape, duration_ms, rule_version, status, started_at, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'burning', ?, ?)`),
    settle: db.prepare('UPDATE candles SET status = ?, ended_at = ?, burned_ms = ?, end_reason = ? WHERE id = ?'),
    checkpoint: db.prepare("UPDATE candles SET burned_ms = MAX(burned_ms, ?) WHERE id = ? AND status = 'burning'"),
    myCandles: db.prepare<[string], CandleRow>('SELECT * FROM candles WHERE visitor_id = ? ORDER BY started_at DESC'),
    myTotals: db.prepare<[string], { candles: number; total: number | null; burned_down: number; went_out: number; unexpected: number }>(`
      SELECT COUNT(*) candles, SUM(burned_ms) total, SUM(status = 'burned_down') burned_down, SUM(status = 'went_out') went_out, SUM(status = 'ended_unexpectedly') unexpected
      FROM candles WHERE visitor_id = ?`),
    myWishes: db.prepare<[string], { id: string; text: string; candles: number; total: number | null; last: number | null }>(`
      SELECT w.id, w.text, COUNT(c.id) candles, SUM(c.burned_ms) total, MAX(c.started_at) last
      FROM wishes w LEFT JOIN candles c ON c.wish_id = w.id WHERE w.visitor_id = ? GROUP BY w.id ORDER BY last DESC`),
    placeStats: db.prepare<[], { place_id: string; candles: number; people: number; total: number; longest: number }>(`
      SELECT place_id, COUNT(*) candles, COUNT(DISTINCT visitor_id) people, SUM(burned_ms) total, MAX(burned_ms) longest FROM candles GROUP BY place_id`),
    allPeople: db.prepare<[], { people: number; total: number | null }>('SELECT COUNT(DISTINCT visitor_id) people, SUM(burned_ms) total FROM candles'),
  };

  // Identity: a random opaque cookie, stored only as a hash.
  function visitorOf(req: FastifyRequest, reply?: FastifyReply): { id: string; locale: string | null } | null {
    const token = req.cookies[COOKIE];
    if (token) {
      const v = q.visitorByHash.get(hash(token));
      if (v) { q.touchVisitor.run(now(), v.id); return v; }
    }
    if (!reply) return null;
    const fresh = randomBytes(32).toString('base64url'), id = randomUUID();
    q.insertVisitor.run(id, hash(fresh), now(), now());
    reply.setCookie(COOKIE, fresh, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https', maxAge: TEN_YEARS_S });
    return { id, locale: null };
  }

  // A burning candle with no live page behind it ended without a trustworthy signal.
  function settleStale(visitorId: string) {
    const c = q.burningOf.get(visitorId);
    if (c && !hub.isLive(c.id)) q.settle.run('ended_unexpectedly', c.started_at + c.burned_ms, c.burned_ms, 'unknown', c.id);
  }

  function totals(visitorId: string) {
    const t = q.myTotals.get(visitorId)!;
    return { candles: t.candles, totalMs: t.total ?? 0, burnedDown: t.burned_down ?? 0, wentOut: t.went_out ?? 0, unexpected: t.unexpected ?? 0 };
  }

  app.get('/api/me', async (req, reply) => {
    const v = visitorOf(req, reply)!;
    settleStale(v.id);
    return { locale: v.locale, totals: totals(v.id) };
  });

  app.put('/api/me/locale', async (req, reply) => {
    const v = visitorOf(req, reply)!;
    const body = z.object({ locale: z.enum(['zh', 'en']) }).parse(req.body);
    q.setLocale.run(body.locale, v.id);
    return { locale: body.locale };
  });

  const lightBody = z.object({
    runId: z.string().min(8).max(64),
    placeId: z.enum(PLACE_IDS),
    shape: shapeSchema,
    wishId: z.string().optional(),
    wishText: z.string().trim().min(1).max(60).optional(),
  });

  app.post('/api/candles', async (req, reply) => {
    const v = visitorOf(req, reply)!;
    const parsed = lightBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid' });
    const b = parsed.data;
    const repeat = q.candleByRun.get(v.id, b.runId);
    if (repeat) return publicCandle(repeat);
    const place = placeById(b.placeId)!;
    if (b.shape.kind !== { wax: 'candle', oil: 'oil', shade: 'shade' }[place.vessel]) return reply.code(400).send({ error: 'vessel' });
    const minutes = shapeMinutes(b.shape);
    if (!isAllowedMinutes(minutes)) return reply.code(400).send({ error: 'duration' });
    settleStale(v.id);
    if (q.burningOf.get(v.id)) return reply.code(409).send({ error: 'already_burning' });
    let wish: { id: string; text: string } | undefined;
    if (b.wishId) wish = q.wish.get(b.wishId, v.id);
    else if (b.wishText) { wish = { id: randomUUID(), text: b.wishText }; q.insertWish.run(wish.id, v.id, wish.text, now()); }
    if (!wish) return reply.code(400).send({ error: 'wish' });
    const id = randomUUID();
    q.insertCandle.run(id, v.id, wish.id, wish.text, b.placeId, JSON.stringify(b.shape), minutes * 60_000, RULE_VERSION, now(), b.runId);
    return publicCandle(q.candle.get(id, v.id)!);
  });

  const endBody = z.object({ runId: z.string(), reason: z.enum(['left', 'navigated', 'put_out', 'complete']), burnedMs: z.number().min(0) });

  const endCandle = async (req: FastifyRequest, reply: FastifyReply) => {
    const v = visitorOf(req);
    if (!v) return reply.code(401).send({ error: 'unknown_visitor' });
    const b = endBody.parse(req.body);
    const params = req.params as { id?: string; runId?: string };
    const c = params.id ? q.candle.get(params.id, v.id) : q.candleByRun.get(v.id, params.runId!);
    if (!c || c.run_id !== b.runId) return reply.code(404).send({ error: 'not_found' });
    // Only a burning candle, or one marked unexpected that this same run now explains, can be settled.
    const reconcilable = c.status === 'ended_unexpectedly' && c.run_id === b.runId;
    if (c.status === 'burning' || reconcilable) {
      const burned = Math.min(b.burnedMs, now() - c.started_at + END_SLACK_MS, c.duration_ms);
      // A Pine Gate candle put out just before the end still keeps its remaining wax.
      const tolerance = c.place_id === 'pine-gate' && b.reason !== 'complete' ? 0 : BURN_DOWN_TOLERANCE_MS;
      const done = burned >= c.duration_ms - tolerance;
      const finalBurned = done ? c.duration_ms : Math.floor(burned);
      q.settle.run(done ? 'burned_down' : 'went_out', c.started_at + finalBurned, finalBurned, done ? 'complete' : b.reason === 'complete' ? 'left' : b.reason, c.id);
    }
    return publicCandle(q.candle.get(c.id, v.id)!);
  };
  app.post('/api/candles/:id/end', endCandle);
  app.post('/api/runs/:runId/end', endCandle);

  app.get('/api/me/candles', async (req, reply) => {
    const v = visitorOf(req, reply)!;
    return { candles: q.myCandles.all(v.id).map(publicCandle), totals: totals(v.id) };
  });

  app.get('/api/me/wishes', async (req, reply) => {
    const v = visitorOf(req, reply)!;
    return { wishes: q.myWishes.all(v.id).map((w) => ({ id: w.id, text: w.text, candles: w.candles, totalMs: w.total ?? 0 })) };
  });

  // Public: aggregates only. Never wish text, shapes or identities.
  app.get('/api/places/stats', async () => {
    const rows = new Map(q.placeStats.all().map((r) => [r.place_id, r]));
    const all = q.allPeople.get()!;
    return {
      now: hub.countAll(), people: all.people, totalMs: all.total ?? 0,
      places: PLACE_IDS.map((id) => {
        const r = rows.get(id);
        return { placeId: id, now: hub.count(id), people: r?.people ?? 0, candles: r?.candles ?? 0, totalMs: r?.total ?? 0,
          averageMs: r && r.candles ? Math.round(r.total / r.candles) : 0, longestMs: r?.longest ?? 0 };
      }),
    };
  });

  const wsMsg = z.discriminatedUnion('type', [
    z.object({ type: z.literal('watch'), placeId: z.enum(PLACE_IDS) }),
    z.object({ type: z.literal('burn'), candleId: z.string() }),
    z.object({ type: z.literal('beat'), burnedMs: z.number().min(0) }),
    z.object({ type: z.literal('stop') }),
  ]);

  app.get('/api/presence', { websocket: true }, (socket, req) => {
    const v = visitorOf(req);
    if (!v) { socket.close(4001, 'unknown visitor'); return; }
    const peer = hub.add(v.id, (msg) => { if (socket.readyState === 1) socket.send(JSON.stringify(msg)); });
    socket.on('message', (raw: Buffer) => {
      let m: z.infer<typeof wsMsg>;
      try { m = wsMsg.parse(JSON.parse(raw.toString())); } catch { return; }
      if (m.type === 'watch') hub.watch(peer, m.placeId);
      else if (m.type === 'burn') {
        const c = q.candle.get(m.candleId, v.id);
        if (c && c.status === 'burning') hub.burn(peer, c.place_id, c.id);
      } else if (m.type === 'beat' && peer.candleId) {
        const c = q.candle.get(peer.candleId, v.id);
        if (c) q.checkpoint.run(Math.floor(Math.min(m.burnedMs, now() - c.started_at, c.duration_ms)), c.id);
        hub.beat(peer);
      } else if (m.type === 'stop') hub.stop(peer);
    });
    socket.on('close', () => hub.remove(peer));
  });

  const sweep = setInterval(() => hub.sweep(), HEARTBEAT_MS);
  app.addHook('onClose', async () => clearInterval(sweep));

  return { app, db, hub };
}
