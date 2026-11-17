import { useEffect, useState } from 'react';
import type { Locale } from '../../shared/places.ts';
import { DEFAULT_PLACE, VISIBLE_PLACES, isVisiblePlace, visiblePlaceById } from './visiblePlaces.ts';
import { api, type Candle, type Stats, type Totals, type WishSummary } from './api.ts';
import { CandleThumb } from './CandleThumb.tsx';
import { fmtDateRange, fmtDuration, type Dict } from './i18n.ts';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { Promise.all([api.myCandles(), api.myWishes()]).then(([c, w]) => { setData(c); setWishes(w.wishes); }).catch(() => setFailed(true)); }, []);

  // Hidden-place records keep their real place and remain on the server. Every visible number
  // comes from this same filtered collection, including a wish that has lamps in several places.
  const lamps = data?.candles.filter((lamp) => isVisiblePlace(lamp.placeId)) ?? [];
  const totals = lamps.reduce((sum, lamp) => ({
    candles: sum.candles + 1,
    totalMs: sum.totalMs + lamp.burnedMs,
    burnedDown: sum.burnedDown + Number(lamp.status === 'burned_down'),
    wentOut: sum.wentOut + Number(lamp.status === 'went_out'),
  }), { candles: 0, totalMs: 0, burnedDown: 0, wentOut: 0 });
  const list = lamps.filter((lamp) => filter === 'all' || (filter === 'done' ? lamp.status === 'burned_down' : lamp.status === 'went_out'));
  const visibleWishes = wishes?.flatMap((wish) => {
    const records = lamps.filter((lamp) => lamp.wishId === wish.id);
    return records.length ? [{ ...wish, candles: records.length, totalMs: records.reduce((sum, lamp) => sum + lamp.burnedMs, 0) }] : [];
  }) ?? [];
  return (
    <Panel title={t.mineTitle} onClose={onClose} closeLabel={t.close}>
      {VISIBLE_PLACES.length > 1 && <p className="panel-place-context">{VISIBLE_PLACES.map((place) => place.name[locale]).join(' · ')}</p>}
      {failed ? <p>{t.loadFailed}</p> : !data ? <p>{t.loading}</p> : (
        <>
          <div className="facts">
            <div><strong data-testid="mine-total">{fmtDuration(totals.totalMs, t)}</strong><span>{t.mineTotal}</span></div>
            <div><strong>{totals.candles}</strong><span>{t.mineCandles}</span></div>
            <div><strong>{totals.burnedDown}</strong><span>{t.mineDone}</span></div>
            <div><strong>{totals.wentOut}</strong><span>{t.mineOut}</span></div>
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
              {!list.length && <p>{filter === 'all' ? t.mineEmpty : t.filterEmpty}</p>}
              <ul className="records">
                {list.map((c) => (
                  <li key={c.id} className={`record ${c.status}${selectedId === c.id ? ' expanded' : ''}`} data-testid="record">
                    <button className="record-summary" aria-label={`${t.recordDetails}: ${c.wish}`} aria-expanded={selectedId === c.id} onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}>
                      <CandleThumb shape={c.shape} remaining={1 - c.burnedMs / c.durationMs} state={c.status === 'ended_unexpectedly' ? 'went_out' : c.status} />
                      <span className="record-copy">
                        <span className="record-wish">{c.wish}</span>
                        <span className="record-state"><span className="tag" data-testid="record-status">{statusText(c, t)}</span><span className="record-chevron" aria-hidden="true">⌄</span></span>
                        <span className="meta">{t.recordTime(fmtDuration(c.burnedMs, t, true), fmtDuration(c.durationMs, t))}</span>
                        <span className="meta">{fmtDateRange(c.startedAt, c.endedAt, locale)}</span>
                        {VISIBLE_PLACES.length > 1 && <span className="meta">{visiblePlaceById(c.placeId)!.name[locale]}</span>}
                      </span>
                    </button>
                    {selectedId === c.id && <div className="record-detail">
                      {c.endReason !== 'complete' && <p className="meta">{reasonText(c, t)}</p>}
                      {c.status !== 'burning' && <button className="btn small" onClick={() => onAgain(c.wishId, c.wish)}>{t.again}</button>}
                    </div>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="records">
              {!visibleWishes.length && <p>{t.mineEmpty}</p>}
              {visibleWishes.map((w) => (
                <li key={w.id} className="record wish-record">
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
  useEffect(() => {
    const load = () => api.stats().then((s) => { setStats(s); setFailed(false); }).catch(() => setFailed(true));
    load(); const id = setInterval(load, 10_000); return () => clearInterval(id);
  }, []);
  // With this one visible court, its own people count is exact. The server's global people
  // count includes the hidden places and must not be presented as this court's count.
  const summary = stats?.places.find((row) => row.placeId === DEFAULT_PLACE.id);
  return (
    <Panel title={t.statsTitle} onClose={onClose} closeLabel={t.close}>
      <p className="lead">{t.statsLead}</p>
      {failed && <p>{t.loadFailed}</p>}
      {!stats ? !failed && <p>{t.loading}</p> : !summary ? <p>{t.statsEmpty}</p> : (
        <section className="court-stats" data-testid={`stat-${DEFAULT_PLACE.id}`}>
          <div className="court-stats-heading"><h3>{DEFAULT_PLACE.name[locale]}</h3><p>{DEFAULT_PLACE.line[locale]}</p></div>
          <div className="facts">
            <div><strong>{summary.now}</strong><span>{t.statsNow}</span></div>
            <div><strong>{summary.people}</strong><span>{t.statsPeople}</span></div>
            <div><strong>{summary.candles}</strong><span>{t.statsLamps}</span></div>
            <div><strong>{fmtDuration(summary.totalMs, t)}</strong><span>{t.statsTime}</span></div>
          </div>
          <dl className="court-stats-times">
            <div><dt>{t.statsAverage}</dt><dd>{fmtDuration(summary.averageMs, t)}</dd></div>
            <div><dt>{t.statsLongest}</dt><dd>{fmtDuration(summary.longestMs, t)}</dd></div>
          </dl>
        </section>
      )}
    </Panel>
  );
}
