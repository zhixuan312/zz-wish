import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../server/app.ts';
import { presetRows } from '../../../shared/rules.ts';

let clock = 1_800_000_000_000;
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeEach(async () => { clock = 1_800_000_000_000; ({ app } = await buildApp({ dbFile: ':memory:', now: () => clock })); });
afterEach(async () => { await app.close(); });

async function visitor() {
  const res = await app.inject({ method: 'GET', url: '/api/me' });
  const cookie = String(res.headers['set-cookie']).split(';')[0];
  const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie } });
  return { call, cookie };
}
const candle = (minutes: number, extra: object = {}) => ({ runId: `run-${Math.random().toString(36).slice(2)}`, placeId: 'lingyin', shape: { kind: 'candle', color: 0, rows: presetRows(minutes) }, wishText: 'a private wish', ...extra });

describe('candles', () => {
  it('records a candle that went out, and it can never burn again', async () => {
    const v = await visitor();
    const body = candle(30);
    const c = (await v.call('POST', '/api/candles', body)).json();
    expect(c.durationMs).toBe(30 * 60_000);
    clock += 10 * 60_000;
    const out = (await v.call('POST', `/api/candles/${c.id}/end`, { runId: body.runId, reason: 'left', burnedMs: 10 * 60_000 })).json();
    expect(out.status).toBe('went_out');
    expect(out.burnedMs).toBe(10 * 60_000);
    clock += 30 * 60_000;
    const again = (await v.call('POST', `/api/candles/${c.id}/end`, { runId: body.runId, reason: 'complete', burnedMs: 30 * 60_000 })).json();
    expect(again.status).toBe('went_out');
    const fresh = (await v.call('POST', '/api/candles', candle(10, { wishId: c.wishId, wishText: undefined }))).json();
    expect(fresh.id).not.toBe(c.id);
    const list = (await v.call('GET', '/api/me/candles')).json();
    expect(list.candles.map((x: { status: string }) => x.status)).toEqual(['burning', 'went_out']);
  });

  it('burns down only when the full time has really passed', async () => {
    const v = await visitor();
    const body = candle(10);
    const c = (await v.call('POST', '/api/candles', body)).json();
    clock += 2 * 60_000;
    const early = (await v.call('POST', `/api/candles/${c.id}/end`, { runId: body.runId, reason: 'complete', burnedMs: 10 * 60_000 })).json();
    expect(early.status).toBe('went_out');

    const body2 = candle(10);
    const c2 = (await v.call('POST', '/api/candles', body2)).json();
    clock += 10 * 60_000;
    const done = (await v.call('POST', `/api/candles/${c2.id}/end`, { runId: body2.runId, reason: 'complete', burnedMs: 10 * 60_000 })).json();
    expect(done.status).toBe('burned_down');
  });

  it('allows one burning candle per visitor while its page is live, and rejects under 5 minutes', async () => {
    const v = await visitor();
    const c = (await v.call('POST', '/api/candles', candle(30))).json();
    const ws = await app.injectWS('/api/presence', { headers: { cookie: v.cookie } });
    ws.send(JSON.stringify({ type: 'burn', candleId: c.id }));
    await new Promise((r) => setTimeout(r, 50));
    expect((await v.call('POST', '/api/candles', candle(30))).statusCode).toBe(409);
    ws.terminate();
    const tiny = candle(30, { shape: { kind: 'candle', color: 0, rows: [{ y: 0, cx: 0, r: 0.004 }, { y: 0.01, cx: 0, r: 0.004 }] } });
    expect((await v.call('POST', '/api/candles', tiny)).statusCode).toBe(400);
  });

  it('marks a candle with no live page as ended unexpectedly, and the same run can still explain it', async () => {
    const v = await visitor();
    const body = candle(30);
    const c = (await v.call('POST', '/api/candles', body)).json();
    expect((await v.call('POST', '/api/candles', candle(30))).statusCode).toBe(200); // the stale one no longer blocks
    const list = (await v.call('GET', '/api/me/candles')).json();
    expect(list.candles.find((x: { id: string }) => x.id === c.id).status).toBe('ended_unexpectedly');
    clock += 60_000;
    const fixed = (await v.call('POST', `/api/candles/${c.id}/end`, { runId: body.runId, reason: 'left', burnedMs: 60_000 })).json();
    expect(fixed.status).toBe('went_out');
  });
});

describe('privacy and stats', () => {
  it('keeps wishes private and reports total, average and longest per place', async () => {
    const a = await visitor(), b = await visitor();
    for (const [v, minutes] of [[a, 10], [b, 30]] as const) {
      const body = candle(minutes);
      const c = (await v.call('POST', '/api/candles', body)).json();
      clock += minutes * 60_000;
      await v.call('POST', `/api/candles/${c.id}/end`, { runId: body.runId, reason: 'complete', burnedMs: minutes * 60_000 });
    }
    const stats = await app.inject({ method: 'GET', url: '/api/places/stats' });
    expect(stats.body).not.toContain('a private wish');
    const lingyin = stats.json().places.find((p: { placeId: string }) => p.placeId === 'lingyin');
    expect(lingyin).toMatchObject({ people: 2, candles: 2, totalMs: 40 * 60_000, averageMs: 20 * 60_000, longestMs: 30 * 60_000 });
    const bList = (await b.call('GET', '/api/me/candles')).json();
    expect(bList.candles).toHaveLength(1);
    expect(bList.totals.totalMs).toBe(30 * 60_000);
  });
});
