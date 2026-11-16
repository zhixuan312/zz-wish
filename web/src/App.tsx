import { useEffect, useMemo, useRef, useState } from 'react';
import * as engine from './engine/scene.js';
import { PLACES, placeById, type Locale, type PlaceId } from '../../shared/places.ts';
import { DEFAULT_PRESET, MAX_MINUTES, MIN_MINUTES, PRESET_MINUTES, WAX_COLORS, isAllowedMinutes, presetRows, shapeMinutes, type Shape } from '../../shared/rules.ts';
import { api, ApiError, type EndReason, type Stats } from './api.ts';
import { Burn, type Settlement } from './burn.ts';
import { presence } from './presence.ts';
import { DrawPad, rowsFromStrokes, type Pt } from './DrawPad.tsx';
import { MyCandles, TenLights } from './Panels.tsx';
import { DICTS, fmtClock, fmtDuration } from './i18n.ts';

type Screen = 'wish' | 'place' | 'travel' | 'candle' | 'confirm' | 'burning' | 'result';
type Overlay = 'mine' | 'stats' | null;
interface Result { done: boolean; burnedMs: number; plannedMs: number; reason: EndReason; saved: boolean | null }

const TOAST_GAP_MS = 5 * 60_000;

export function App({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const t = DICTS[locale];
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = t.pageTitle;
  }, [locale, t]);
  const switchLocale = () => { const next = locale === 'zh' ? 'en' : 'zh'; setLocaleState(next); api.setLocale(next).catch(() => {}); };

  const [screen, setScreen] = useState<Screen>('wish');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  // What the person is making.
  const [wish, setWish] = useState('');
  const [wishId, setWishId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<PlaceId>('lingyin');
  const place = placeById(placeId)!;
  const isLamp = place.vessel === 'lamp';
  const [tab, setTab] = useState<'preset' | 'draw'>('preset');
  const [preset, setPreset] = useState<number>(DEFAULT_PRESET);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [color, setColor] = useState(0);
  const [fillMinutes, setFillMinutes] = useState(60);
  const shape: Shape | null = useMemo(() => {
    if (isLamp) return { kind: 'lamp', fill: (tab === 'preset' ? preset : fillMinutes) / MAX_MINUTES };
    if (tab === 'preset') return { kind: 'candle', rows: presetRows(preset), color: WAX_COLORS[color] };
    const rows = rowsFromStrokes(strokes);
    return rows ? { kind: 'candle', rows, color: WAX_COLORS[color] } : null;
  }, [isLamp, tab, preset, fillMinutes, strokes, color]);
  const minutes = shape ? shapeMinutes(shape) : null;
  const allowed = minutes !== null && isAllowedMinutes(minutes);
  useEffect(() => { if (screen === 'candle') engine.setOffer(shape); }, [shape, screen]);

  // Live presence for the place on screen.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [online, setOnline] = useState(presence.online);
  const [toast, setToast] = useState(false);
  const [toastMuted, setToastMuted] = useState(false);
  const lastToast = useRef(0);
  const screenRef = useRef(screen); screenRef.current = screen;
  const placeRef = useRef(placeId); placeRef.current = placeId;
  const mutedRef = useRef(toastMuted); mutedRef.current = toastMuted;
  useEffect(() => { setOnline(presence.online); }, []); // the socket may have opened before this component subscribed
  useEffect(() => presence.on((e) => {
    if (e.type === 'status') setOnline(e.online);
    else if (e.type === 'count' && e.placeId === placeRef.current) setLiveCount(e.now);
    else if (e.type === 'lit' && e.placeId === placeRef.current && screenRef.current === 'burning' && !mutedRef.current && Date.now() - lastToast.current > TOAST_GAP_MS) {
      lastToast.current = Date.now(); setToast(true); setTimeout(() => setToast(false), 6000);
    }
  }), []);
  useEffect(() => {
    if (['place', 'travel', 'candle', 'confirm'].includes(screen)) { setLiveCount(null); presence.watch(placeId); }
  }, [screen, placeId]);
  const [placeStats, setPlaceStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (screen !== 'place') return;
    const load = () => api.stats().then(setPlaceStats).catch(() => setPlaceStats(null));
    load(); const id = setInterval(load, 10_000); return () => clearInterval(id);
  }, [screen]);

  // The lighting.
  const burnRef = useRef<Burn | null>(null);
  const [, setTick] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [lightError, setLightError] = useState<string | null>(null);
  const [askPutOut, setAskPutOut] = useState(false);
  const [askLeave, setAskLeave] = useState<Overlay>(null);
  const [showWish, setShowWish] = useState(true);
  const [showLeft, setShowLeft] = useState(false);
  const afterSettle = useRef<Overlay>(null);

  useEffect(() => {
    if (screen !== 'burning') return;
    const id = setInterval(() => { const b = burnRef.current; if (b) engine.setLevel(1 - b.elapsed() / b.planned); setTick((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [screen]);

  const light = async () => {
    if (!shape || !allowed || busy) return;
    setLightError(null); setAskPutOut(false);
    const lightPlace = placeId;
    const b = new Burn(minutes! * 60_000, (s: Settlement) => {
      presence.stopBurning();
      burnRef.current = null;
      engine.snuff(s.done);
      setResult({ done: s.done, burnedMs: s.burnedMs, plannedMs: b.planned, reason: s.reason, saved: null });
      setScreen('result'); setAskLeave(null);
      s.saved.then((c) => setResult((r) => r && { ...r, saved: !!c }));
      if (afterSettle.current) { setOverlay(afterSettle.current); afterSettle.current = null; }
      presence.watch(lightPlace);
    });
    burnRef.current = b; setBusy(true);
    b.keepScreenOn();
    setScreen('burning'); setShowLeft(false); engine.ignite();
    try {
      const c = await api.light({ runId: b.runId, placeId: lightPlace, shape, ...(wishId ? { wishId } : { wishText: wish.trim() }) });
      setWishId(c.wishId);
      b.confirm(c);
      if (!b.isSettled) presence.burn(lightPlace, c.id, () => b.elapsed());
    } catch (e) {
      if (!b.isSettled) {
        b.abort(); burnRef.current = null; engine.snuff(); setScreen('confirm');
        setLightError(e instanceof ApiError && e.code === 'already_burning' ? t.alreadyBurning : t.lightFailed);
      }
    } finally { setBusy(false); }
  };

  const open = (o: Overlay) => { if (screen === 'burning' && burnRef.current) setAskLeave(o); else setOverlay(o); };
  const leaveAndOpen = () => { afterSettle.current = askLeave; setAskLeave(null); burnRef.current?.settle('navigated'); };

  // Navigation between steps; the scene moves with them.
  const toPlace = () => { setScreen('place'); run(() => engine.previewPlace(placeId)); };
  const pickPlace = (id: PlaceId) => { setPlaceId(id); if (placeById(id)!.vessel === 'lamp' || isLamp) setTab('preset'); engine.previewPlace(id); };
  const goTravel = () => run(async () => {
    engine.setOffer(shape); setScreen('travel');
    await engine.travel(placeId); setScreen('candle');
  });
  const backToPlace = () => { engine.setOffer(null); toPlace(); };
  const toConfirm = () => run(async () => { setLightError(null); await engine.closeUp(); setScreen('confirm'); });
  const backToCandle = () => run(async () => { setScreen('candle'); await engine.backToChoose(); });
  const again = (id: string | null, text: string) => { setOverlay(null); setWishId(id); setWish(text); setResult(null); backToPlace(); };
  const startOver = () => { setWish(''); setWishId(null); setStrokes([]); setResult(null); setScreen('wish'); run(() => engine.toHall()); };
  const backToWish = () => { setScreen('wish'); run(() => engine.toHall()); };

  const dLabel = minutes !== null ? fmtDuration(minutes * 60_000, t) : '—';
  const b = burnRef.current;
  const pill = online ? (liveCount === null ? null : t.presence(liveCount, screen === 'burning')) : t.presenceOff;

  return (
    <div className="ui">
      <header className="topbar">
        <span className="brand">{t.brand}</span>
        <nav>
          {screen !== 'burning' && <button className="btn small" onClick={switchLocale} aria-label={t.langSwitchLabel}>{t.langSwitch}</button>}
          <button className="btn small" onClick={() => open('stats')}>{t.tenLights}</button>
          <button className="btn small" onClick={() => open('mine')}>{t.myCandles}</button>
        </nav>
      </header>

      {pill && ['place', 'candle', 'confirm', 'burning'].includes(screen) && <div className="pill" role="status" data-testid="presence">{pill}</div>}
      {toast && <div className="toast" role="status">{t.toastLit} <button className="btn small" onClick={() => { setToastMuted(true); setToast(false); }}>{t.toastMute}</button></div>}

      {screen === 'wish' && (
        <section className="sheet">
          <div className="inner">
            <div className="eyebrow">{t.wishEyebrow}</div>
            <h1>{t.wishTitle}</h1>
            <p>{t.wishLead}</p>
            <textarea value={wish} maxLength={60} rows={2} placeholder={t.wishPlaceholder} aria-label={t.wishLabel}
              onChange={(e) => { setWish(e.target.value); setWishId(null); }} />
            <div className="counter">{wish.length} / 60</div>
            <p className="note">{t.wishRules}</p>
            <button className="btn primary" disabled={!wish.trim() || busy} onClick={toPlace}>{t.wishNext}</button>
          </div>
        </section>
      )}

      {screen === 'place' && (
        <section className="sheet low">
          <div className="inner">
            <div className="eyebrow">{t.placeEyebrow}</div>
            <div className="tname">{place.name[locale]}</div>
            <p className="note">{place.where[locale]} · {place.line[locale]}</p>
            <div className="places" role="radiogroup">
              {PLACES.map((p) => (
                <button key={p.id} role="radio" aria-checked={p.id === placeId} className="place" onClick={() => pickPlace(p.id)}>
                  <span>{p.name[locale]}</span>
                  <small>{placeStats ? t.placeNowCount(placeStats.places.find((s) => s.placeId === p.id)?.now ?? 0) : ' '}</small>
                </button>
              ))}
            </div>
            <div className="row">
              <button className="btn" onClick={backToWish} disabled={busy}>{t.placeBack}</button>
              <button className="btn primary" onClick={goTravel} disabled={busy}>{t.placeGo}</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'travel' && (
        <>
          <div className="travel"><div className="go">{t.travelGo}</div><div className="big">{place.name[locale]}</div><div className="where">{place.where[locale]}</div></div>
          <button className="btn small skip" onClick={() => engine.skip()}>{t.skip}</button>
        </>
      )}

      {screen === 'candle' && (
        <section className="sheet">
          <div className="inner">
            <div className="eyebrow">{t.candleEyebrow}</div>
            <h2>{isLamp ? t.lampTitle : t.candleTitle}</h2>
            <div className="tabs" role="tablist">
              <button role="tab" className="tab" aria-selected={tab === 'preset'} onClick={() => setTab('preset')}>{t.tabPresets}</button>
              <button role="tab" className="tab" aria-selected={tab === 'draw'} onClick={() => setTab('draw')}>{isLamp ? t.tabFill : t.tabDraw}</button>
            </div>
            {tab === 'preset' ? (
              <div className="sizes" role="radiogroup">
                {PRESET_MINUTES.map((m) => (
                  <button key={m} role="radio" aria-checked={preset === m} className="size" onClick={() => setPreset(m)}>{fmtDuration(m * 60_000, t)}</button>
                ))}
              </div>
            ) : isLamp ? (
              <div className="fill">
                <p className="note">{t.fillHint}</p>
                <input type="range" min={MIN_MINUTES} max={MAX_MINUTES} step={5} value={fillMinutes} aria-label={t.tabFill} onChange={(e) => setFillMinutes(Number(e.target.value))} />
              </div>
            ) : (
              <div className="draw">
                <DrawPad strokes={strokes} setStrokes={setStrokes} color={WAX_COLORS[color]} label={t.drawHint} empty={t.drawEmpty} />
                <div className="draw-side">
                  <p className="note">{t.drawHint}</p>
                  <div className="row">
                    <button className="btn small" disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>{t.drawUndo}</button>
                    <button className="btn small" disabled={!strokes.length} onClick={() => setStrokes([])}>{t.drawClear}</button>
                  </div>
                </div>
              </div>
            )}
            {!isLamp && (
              <div className="swatches" role="radiogroup" aria-label={t.colorLabel}>
                {WAX_COLORS.map((c, i) => (
                  <button key={c} role="radio" aria-checked={color === i} aria-label={t.colors[i]} className="swatch" style={{ background: `#${c.toString(16).padStart(6, '0')}` }} onClick={() => setColor(i)} />
                ))}
              </div>
            )}
            <div className="readout" aria-live="polite">
              <span className="note">{isLamp ? t.lampBurnsFor : t.burnsFor}</span>
              <strong data-testid="duration">{dLabel}</strong>
              {minutes !== null && minutes < MIN_MINUTES && <span className="note">{t.tooShort}</span>}
              {minutes === MAX_MINUTES && <span className="note">{t.atMax}</span>}
            </div>
            <div className="row">
              <button className="btn" onClick={backToPlace} disabled={busy}>{t.candleBack}</button>
              <button className="btn primary" onClick={toConfirm} disabled={!allowed || busy}>{t.candleTake(dLabel)}</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'confirm' && (
        <section className="sheet">
          <div className="inner">
            <h2>{t.confirmTitle}</h2>
            <p className="quote">「{wish}」</p>
            <p>{place.name[locale]} · {dLabel}</p>
            <p className="note">{t.confirmRule}</p>
            {minutes !== null && minutes >= 720 && <p className="note">{t.confirmLong}</p>}
            {lightError && <p className="error" role="alert">{lightError}</p>}
            <div className="row">
              <button className="btn" onClick={backToCandle} disabled={busy}>{t.confirmBack}</button>
              <button className="btn primary" onClick={light} disabled={busy}>{t.light(dLabel)}</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'burning' && b && (
        <div className="hud">
          <div className="hud-top">{place.name[locale]} · {place.where[locale]}</div>
          <div className="hud-bottom">
            {showWish && <div className="hud-wish">「{wish}」</div>}
            <div className="hud-time" data-testid="with-you">{t.withYou(fmtDuration(b.elapsed(), t), fmtDuration(b.planned, t))}</div>
            {showLeft && <div className="hud-left">{t.remaining(fmtClock(b.planned - b.elapsed()))}</div>}
            <div className="note">{b.wakeOn ? t.wakeOn : t.wakeOff}</div>
            {askPutOut ? (
              <div className="confirm-box">
                <p>{t.putOutAsk}</p>
                <div className="row">
                  <button className="btn small" onClick={() => b.settle('put_out')}>{t.putOutYes}</button>
                  <button className="btn small primary" onClick={() => setAskPutOut(false)}>{t.keepBurning}</button>
                </div>
              </div>
            ) : (
              <div className="row ctl">
                <button className="btn small" onClick={() => setShowWish(!showWish)}>{showWish ? t.hideWish : t.showWish}</button>
                <button className="btn small" onClick={() => setShowLeft(!showLeft)}>{showLeft ? t.hideRemaining : t.showRemaining}</button>
                <button className="btn small" onClick={() => setAskPutOut(true)}>{t.putOut}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {askLeave && (
        <div className="dialog" role="alertdialog" aria-modal="true">
          <p>{t.leaveAsk}</p>
          <div className="row">
            <button className="btn small" onClick={leaveAndOpen}>{t.leaveYes}</button>
            <button className="btn small primary" onClick={() => setAskLeave(null)}>{t.stay}</button>
          </div>
        </div>
      )}

      {screen === 'result' && result && (
        <section className="sheet">
          <div className="inner">
            <h2 data-testid="result-title">{result.done ? t.doneTitle : t.outTitle}</h2>
            <p>{result.done ? t.doneLead(fmtDuration(result.plannedMs, t)) : t.outLead(fmtDuration(result.burnedMs, t, true), fmtDuration(result.plannedMs, t))}</p>
            <p className="note">{result.saved === false ? t.saving : result.saved ? t.saved : ' '}</p>
            <button className="btn primary" onClick={() => again(wishId, wish)}>{t.again}</button>
            <p className="note">{t.againSmall}</p>
            <div className="row">
              <button className="btn" onClick={() => setOverlay('mine')}>{t.seeMine}</button>
              <button className="btn" onClick={startOver}>{t.startOver}</button>
            </div>
          </div>
        </section>
      )}

      {overlay === 'mine' && <MyCandles t={t} locale={locale} onClose={() => setOverlay(null)} onAgain={(id, text) => again(id, text)} />}
      {overlay === 'stats' && <TenLights t={t} locale={locale} onClose={() => setOverlay(null)} />}
    </div>
  );
}
