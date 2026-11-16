import { useEffect, useState } from 'react';
import { PLACES, placeById, type Locale } from '../../shared/places.ts';
import { api, type Candle, type Stats, type Totals, type WishSummary } from './api.ts';
import { CandleThumb } from './CandleThumb.tsx';
import { fmtDateTime, fmtDuration, type Dict } from './i18n.ts';

function Panel({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <section className="panel" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-inner">
        <div className="panel-head"><h2>{title}</h2><button className="btn small" onClick={onClose}>{closeLabel}</button></div>
        {children}
      </div>
    </section>
  );
}

export function statusText(c: Candle, t: Dict) {
  return c.status === 'burned_down' ? t.statusDone : c.status === 'went_out' ? t.statusOut : c.status === 'burning' ? t.statusBurning : t.statusUnknown;
}
const reasonText = (c: Candle, t: Dict) =>
  ({ left: t.reasonLeft, navigated: t.reasonNavigated, put_out: t.reasonPutOut, complete: t.reasonComplete, unknown: t.reasonUnknown } as Record<string, string>)[c.endReason ?? ''] ?? '';

export function MyCandles({ t, locale, onClose, onAgain }: { t: Dict; locale: Locale; onClose: () => void; onAgain: (wishId: string, text: string) => void }) {
  const [data, setData] = useState<{ candles: Candle[]; totals: Totals } | null>(null);
  const [wishes, setWishes] = useState<WishSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'candles' | 'wishes'>('candles');
  const [filter, setFilter] = useState<'all' | 'done' | 'out'>('all');
  useEffect(() => { Promise.all([api.myCandles(), api.myWishes()]).then(([c, w]) => { setData(c); setWishes(w.wishes); }).catch(() => setFailed(true)); }, []);

  const list = data?.candles.filter((c) => filter === 'all' || (filter === 'done' ? c.status === 'burned_down' : c.status === 'went_out')) ?? [];
  return (
    <Panel title={t.mineTitle} onClose={onClose} closeLabel={t.close}>
      {failed ? <p>{t.loadFailed}</p> : !data ? <p>{t.loading}</p> : (
        <>
          <div className="facts">
            <div><strong data-testid="mine-total">{fmtDuration(data.totals.totalMs, t)}</strong><span>{t.mineTotal}</span></div>
            <div><strong>{data.totals.candles}</strong><span>{t.mineCandles}</span></div>
            <div><strong>{data.totals.burnedDown}</strong><span>{t.mineDone}</span></div>
            <div><strong>{data.totals.wentOut}</strong><span>{t.mineOut}</span></div>
          </div>
          <div className="tabs" role="tablist">
            <button role="tab" className="tab" aria-selected={tab === 'candles'} onClick={() => setTab('candles')}>{t.mineTabCandles}</button>
            <button role="tab" className="tab" aria-selected={tab === 'wishes'} onClick={() => setTab('wishes')}>{t.mineTabWishes}</button>
          </div>
          {tab === 'candles' ? (
            <>
              <div className="chips">
                {(['all', 'done', 'out'] as const).map((f) => (
                  <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? t.filterAll : f === 'done' ? t.filterDone : t.filterOut}</button>
                ))}
              </div>
              {!list.length && <p>{t.mineEmpty}</p>}
              <ul className="records">
                {list.map((c) => (
                  <li key={c.id} className={`record ${c.status}`} data-testid="record">
                    <CandleThumb shape={c.shape} remaining={1 - c.burnedMs / c.durationMs} />
                    <div>
                      <p className="record-wish">{c.wish}</p>
                      <p className="tag" data-testid="record-status">{statusText(c, t)}</p>
                      <p className="meta">{placeById(c.placeId)?.name[locale]} · {t.planned(fmtDuration(c.durationMs, t))} · {t.burned(fmtDuration(c.burnedMs, t, true))}</p>
                      <p className="meta">{fmtDateTime(c.startedAt, locale)}{c.endedAt ? ` – ${fmtDateTime(c.endedAt, locale)}` : ''} · {reasonText(c, t)}</p>
                      {c.status !== 'burning' && <button className="btn small" onClick={() => onAgain(c.wishId, c.wish)}>{t.again}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="records">
              {!wishes?.length && <p>{t.mineEmpty}</p>}
              {wishes?.map((w) => (
                <li key={w.id} className="record">
                  <div>
                    <p className="record-wish">{w.text}</p>
                    <p className="meta">{t.wishCandles(w.candles, fmtDuration(w.totalMs, t))}</p>
                    <button className="btn small" onClick={() => onAgain(w.id, w.text)}>{t.again}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

export function TenLights({ t, locale, onClose }: { t: Dict; locale: Locale; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<'people' | 'time' | 'now'>('people');
  useEffect(() => {
    const load = () => api.stats().then((s) => { setStats(s); setFailed(false); }).catch(() => setFailed(true));
    load(); const id = setInterval(load, 10_000); return () => clearInterval(id);
  }, []);
  const order = PLACES.map((p) => p.id);
  const rows = stats ? [...stats.places].sort((a, b) =>
    (sort === 'people' ? b.people - a.people : sort === 'time' ? b.totalMs - a.totalMs : b.now - a.now) || order.indexOf(a.placeId) - order.indexOf(b.placeId)) : [];
  // One data colour: the length of each line of light carries the difference for the chosen sort.
  const measure = (r: Stats['places'][number]) => (sort === 'people' ? r.people : sort === 'time' ? r.totalMs : r.now);
  const peak = Math.max(1, ...rows.map(measure));
  return (
    <Panel title={t.statsTitle} onClose={onClose} closeLabel={t.close}>
      <p className="lead">{t.statsLead}</p>
      {failed && <p>{t.loadFailed}</p>}
      {!stats ? !failed && <p>{t.loading}</p> : (
        <>
          <div className="facts">
            <div><strong>{stats.now}</strong><span>{t.statsNow}</span></div>
            <div><strong>{stats.people}</strong><span>{t.statsPeople}</span></div>
            <div><strong>{fmtDuration(stats.totalMs, t)}</strong><span>{t.statsTime}</span></div>
          </div>
          <div className="chips">
            {(['people', 'time', 'now'] as const).map((s) => (
              <button key={s} className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>{s === 'people' ? t.sortPeople : s === 'time' ? t.sortTime : t.sortNow}</button>
            ))}
          </div>
          <ol className="stat-rows">
            {rows.map((r) => (
              <li key={r.placeId} data-testid={`stat-${r.placeId}`}>
                <strong>{placeById(r.placeId)!.name[locale]}</strong>
                <i className="bar" aria-hidden="true" style={{ '--k': measure(r) / peak } as React.CSSProperties} />
                <span>{t.rowPeople(r.people)} · {t.rowNow(r.now)}</span>
                <span>{t.rowTotal(fmtDuration(r.totalMs, t))} · {t.rowAverage(fmtDuration(r.averageMs, t))} · {t.rowLongest(fmtDuration(r.longestMs, t))}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
