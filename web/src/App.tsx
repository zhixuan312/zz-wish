import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as engine from './engine/index.ts';
import { placeById, type Locale, type PlaceId } from '../../shared/places.ts';
import { DEFAULT_PLACE, VISIBLE_PLACES, isVisiblePlace } from './visiblePlaces.ts';
import { COLORS, DEFAULT_MINUTES, MAX_MINUTES, MIN_MINUTES, PRESET_MINUTES, PRESET_SHAPES, isAllowedMinutes, shapeMinutes, sizedPreset, type Kind, type Shape } from '../../shared/rules.ts';
import { api, ApiError, type EndReason, type Stats } from './api.ts';
import { Burn, type Settlement } from './burn.ts';
import { presence } from './presence.ts';
import { DrawPad, rowsFromStrokes, type Pt } from './DrawPad.tsx';
import { MyCandles, TenLights } from './Panels.tsx';
import { CandleThumb } from './CandleThumb.tsx';
import { sound } from './sound.ts';
import { music, type MusicStage } from './music.ts';
import { DICTS, fmtClock, fmtDuration } from './i18n.ts';

type Screen = engine.ScenePhase;
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
  // One mute governs both the ambient world and the music, and the choice survives.
  const [quiet, setQuiet] = useState(() => music.isMuted());
  useEffect(() => { sound.mute(quiet); music.setMuted(quiet); }, [quiet]);
  const [powerSaver, setPowerSaver] = useState(false);
  useEffect(() => { engine.setPhase(screen); }, [screen]);
  useEffect(() => { engine.setPowerSaver(powerSaver); }, [powerSaver]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Music follows the same screens the engine does; burning and its endings are
  // started by the light and settlement paths below, which know the outcome.
  // The candle screen asks for nothing: either the 36-second walk cue reaches it and
  // hands over on `ended`, or Skip cuts to `choose` first. Starting `choose` here
  // would fade out the walk's authored tail.
  const stageForScreen = (value: Screen, overlayValue: Overlay): MusicStage | null =>
    overlayValue ? 'result' :
    value === 'wish' ? 'home' :
    value === 'place' ? 'place' :
    value === 'travel' ? 'walk' : null;
  const stageRef = useRef<MusicStage | null>(null);
  const screenRef = useRef<Screen>(screen);
  const overlayRef = useRef<Overlay>(null);
  // The place is chosen further down; this ref is updated as soon as it is known.
  const placeIdRef = useRef<PlaceId>(DEFAULT_PLACE.id);
  screenRef.current = screen; overlayRef.current = overlay;
  useEffect(() => {
    const stage = stageForScreen(screen, overlay);
    if (!stage || stage === stageRef.current) return;
    stageRef.current = stage;
    void music.play(stage, placeIdRef.current);
  }, [screen, overlay]);
  // Browsers refuse sound before a gesture. The device may open a moment after the
  // screen has already moved, so play whatever stage is current rather than home.
  useEffect(() => {
    const unlock = () => {
      void music.unlock().then(() => {
        const stage = stageForScreen(screenRef.current, overlayRef.current);
        if (stage) void music.play(stage, placeIdRef.current);
      });
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, []);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  // What the person is making.
  const [wish, setWish] = useState('');
  const wishField = useRef<HTMLTextAreaElement>(null);
  const [wishHint, setWishHint] = useState(false);
  const [wishId, setWishId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<PlaceId>(DEFAULT_PLACE.id);
  const place = placeById(placeId)!;
  const [placeLoad, setPlaceLoad] = useState<{ stage: 'loading' | 'preparing' | 'ready' | 'error'; loadedBytes: number; totalBytes: number | null; ratio: number | null }>({ stage: 'loading', loadedBytes: 0, totalBytes: null, ratio: null });
  const loadTask = useRef<{ id: PlaceId; task: Promise<void> } | null>(null);
  const loadVersion = useRef(0);
  const preparePlace = useCallback((id: PlaceId, retry = false) => {
    if (!retry && loadTask.current?.id === id) return loadTask.current.task;
    const version = ++loadVersion.current;
    setPlaceLoad({ stage: 'loading', loadedBytes: 0, totalBytes: null, ratio: null });
    const task = engine.prefetchPlace(id, (progress) => { if (version === loadVersion.current) setPlaceLoad((current) => {
      const percent = (ratio: number | null) => ratio === null ? null : Math.round(ratio * 100);
      return current.stage === progress.stage && percent(current.ratio) === percent(progress.ratio) ? current : progress;
    }); })
      .then(() => { if (version === loadVersion.current) setPlaceLoad((value) => ({ ...value, stage: 'ready', ratio: 1 })); })
      .catch((error: unknown) => { if (version === loadVersion.current) { loadTask.current = null; setPlaceLoad((value) => ({ ...value, stage: 'error' })); } throw error; });
    loadTask.current = { id, task }; return task;
  }, []);
  useEffect(() => { if (wish.trim()) void preparePlace(placeId).catch(() => {}); }, [wish, placeId, preparePlace]);
  // The place decides the kind of lamp. The person picks a shape and a time (the shape grows with the time),
  // or draws one: the bigger the drawing, the longer it burns.
  const kind: Kind = ({ wax: 'candle', oil: 'oil', shade: 'shade' } as const)[place.vessel];
  const [tab, setTab] = useState<'preset' | 'draw'>('preset');
  const [presetShape, setPresetShape] = useState(0);
  const [preset, setPreset] = useState<number>(DEFAULT_MINUTES);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [drawingMinutes, setDrawingMinutes] = useState<number | null>(null);
  const [color, setColor] = useState(1);
  const shape: Shape | null = useMemo(() => {
    const rows = tab === 'preset' ? sizedPreset(PRESET_SHAPES[kind][presetShape].rows, preset) : rowsFromStrokes(strokes);
    return rows ? { kind, rows, color: COLORS[kind][color] } : null;
  }, [kind, tab, presetShape, preset, strokes, color]);
  const minutes = shape ? shapeMinutes(shape) : null;
  const allowed = minutes !== null && isAllowedMinutes(minutes);
  useEffect(() => { if (screen === 'candle') engine.setOffer(shape); }, [shape, screen]);

  // Live presence for the place on screen.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [online, setOnline] = useState(presence.online);
  const [toast, setToast] = useState(false);
  const [toastMuted, setToastMuted] = useState(false);
  const lastToast = useRef(0);
  const placeRef = useRef(placeId); placeRef.current = placeId;
  placeIdRef.current = placeId;
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
    if (['place', 'travel', 'candle'].includes(screen)) { setLiveCount(null); presence.watch(placeId); }
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
  const [caught, setCaught] = useState(false);
  const [controlsIdle, setControlsIdle] = useState(false);
  const [travelTitle, setTravelTitle] = useState(false);
  const afterSettle = useRef<Overlay>(null);

  useEffect(() => {
    if (screen !== 'travel') { setTravelTitle(false); return; }
    setTravelTitle(true); const timer = window.setTimeout(() => setTravelTitle(false), 4000);
    return () => clearTimeout(timer);
  }, [screen]);
  useEffect(() => {
    setControlsIdle(false);
    if (screen !== 'burning' || !caught || askPutOut || askLeave || overlay) return;
    let timer = 0;
    const show = () => { setControlsIdle(false); clearTimeout(timer); timer = window.setTimeout(() => setControlsIdle(true), 5500); };
    show();
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;
    events.forEach((event) => window.addEventListener(event, show, { passive: true }));
    return () => { clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, show)); };
  }, [screen, caught, askPutOut, askLeave, overlay]);

  useEffect(() => {
    if (screen !== 'burning') return;
    const id = setInterval(() => { const b = burnRef.current; if (b) engine.setLevel(1 - b.elapsed() / b.planned); setTick((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [screen]);

  const light = async () => {
    if (!shape || !allowed || busy || burnRef.current) return;
    setLightError(null); setAskPutOut(false); setCaught(false); setControlsIdle(false);
    const lightPlace = placeId;
    const b = new Burn(minutes! * 60_000, (s: Settlement) => {
      presence.stopBurning(); sound.stop();
      burnRef.current = null;
      void music.play(s.done ? 'endingBurned' : 'endingPutOut', lightPlace);
      engine.snuff(s.done);
      setResult({ done: s.done, burnedMs: s.burnedMs, plannedMs: b.planned, reason: s.reason, saved: null });
      setScreen('result'); setAskLeave(null);
      s.saved.then((c) => setResult((r) => r && { ...r, saved: !!c }));
      if (afterSettle.current) { setOverlay(afterSettle.current); afterSettle.current = null; }
      presence.watch(lightPlace);
    });
    burnRef.current = b; setBusy(true);
    b.keepScreenOn();
    setShowLeft(false); sound.prepare(); sound.start(lightPlace);
    try {
      const c = await api.light({ runId: b.runId, placeId: lightPlace, shape, ...(wishId ? { wishId } : { wishText: wish.trim() }) });
      setWishId(c.wishId);
      b.confirm(c);
      if (!b.isSettled) {
        presence.burn(lightPlace, c.id, () => b.elapsed()); setScreen('burning');
        void engine.ignite({ onCatch: () => {
          // The ignite cue is timed to the flame catching, and its own end hands over
          // to the burning bed; starting the bed here would cut it off. A missing ignite
          // never ends, so the bed starts here instead of the burn staying silent.
          if (burnRef.current === b && !b.isSettled) {
            setCaught(true);
            void music.play('ignite', lightPlace).then((started) => {
              if (!started && burnRef.current === b && !b.isSettled) void music.play('burn', lightPlace);
            });
          }
        } })
          .catch(() => { if (!b.isSettled) b.settle('put_out'); });
      }
    } catch (e) {
      if (!b.isSettled) {
        b.abort(); sound.stop(); burnRef.current = null; setScreen('candle');
        setLightError(e instanceof ApiError && e.code === 'already_burning' ? t.alreadyBurning : t.lightFailed);
      }
    } finally { setBusy(false); }
  };

  const open = (o: Overlay) => { if (burnRef.current && !burnRef.current.isSettled) setAskLeave(o); else setOverlay(o); };
  const leaveAndOpen = () => { afterSettle.current = askLeave; setAskLeave(null); burnRef.current?.settle('navigated'); };

  // The engine keeps one place's past lamps at a time, so the request is keyed on the
  // place and a slower reply for a court already left is dropped rather than applied.
  const pastLampVersion = useRef(0);
  const loadPastLamps = useCallback((id: PlaceId) => {
    const version = ++pastLampVersion.current;
    void api.myCandles().then(({ candles }) => {
      if (version !== pastLampVersion.current) return;
      engine.setOwnPastLamps(
        candles.filter((c) => c.placeId === id && c.status !== 'burning').map((c) => ({
          shape: c.shape, color: c.shape.color, status: c.status,
          remaining: c.durationMs > 0 ? Math.max(0, 1 - c.burnedMs / c.durationMs) : 0,
        })),
      );
    }).catch(() => {});
  }, []);

  // Navigation between steps; the scene moves with them.
  const showPlace = () => {
    setWishHint(false); setScreen('place');
    void run(async () => { await preparePlace(placeId); await engine.previewPlace(placeId); }).catch(() => setPlaceLoad((value) => ({ ...value, stage: 'error' })));
    loadPastLamps(placeId);
  };
  const toPlace = () => {
    if (!wish.trim()) { setWishHint(true); wishField.current?.focus(); return; }
    showPlace();
  };
  const pickPlace = (id: PlaceId) => {
    if (!isVisiblePlace(id)) return;
    setPlaceId(id);
    if (placeById(id)!.vessel !== place.vessel) { setTab('preset'); setPresetShape(0); setStrokes([]); setColor(1); }
    loadPastLamps(id);
    void run(async () => { await preparePlace(id); await engine.previewPlace(id); }).catch(() => setPlaceLoad((value) => ({ ...value, stage: 'error' })));
  };
  const goTravel = () => run(async () => {
    engine.setOffer(shape);
    // Travel never waits for music: the walk must start even if a slow network is
    // still fetching the cue list. Claiming the stage here also stops the screen
    // effect from asking for `walk` a second time.
    stageRef.current = 'walk';
    void music.play('walk', placeId).then((walkStarted) => {
      // Only the cue's own `ended` hands over. When it was never delivered nothing
      // will end, so the candle screen starts `choose` itself.
      if (!walkStarted && screenRef.current === 'candle') { stageRef.current = 'choose'; void music.play('choose', placeId); }
    });
    setScreen('travel');
    await engine.travel(placeId);
    setScreen('candle');
  });
  const backToPlace = () => { engine.setOffer(null); toPlace(); };
  const again = (id: string | null, text: string) => { setOverlay(null); setWishId(id); setWish(text); setStrokes([]); setDrawingMinutes(null); setTab('preset'); setResult(null); engine.setOffer(null); showPlace(); };
  const startOver = () => { setWish(''); setWishId(null); setStrokes([]); setDrawingMinutes(null); setTab('preset'); setPresetShape(0); setPreset(DEFAULT_MINUTES); setColor(1); setWishHint(false); setResult(null); setScreen('wish'); run(() => engine.toCover()); };
  const backToWish = () => { setScreen('wish'); run(() => engine.toCover()); };

  const displayMinutes = drawingMinutes ?? minutes;
  const dLabel = displayMinutes !== null ? fmtDuration(displayMinutes * 60_000, t) : '—';
  const b = burnRef.current;
  const pill = online ? (liveCount === null ? null : t.presence(liveCount, screen === 'burning')) : t.presenceOff;
  const loadingLabel = placeLoad.stage === 'ready' ? (busy && screen === 'place' ? t.courtOpening : t.courtReady) : placeLoad.stage === 'error' ? t.courtLoadFailed : placeLoad.stage === 'preparing' ? t.courtPreparingScene : t.courtLoading(placeLoad.ratio === null ? null : Math.round(placeLoad.ratio * 100));
  const loading = (compact = false) => <div className={`court-loading${compact ? ' compact' : ''}`} data-stage={placeLoad.stage} aria-live="polite">
    <span>{loadingLabel}</span>
    {(placeLoad.stage === 'loading' || placeLoad.stage === 'preparing') && <progress aria-label={t.courtLoadingLabel} aria-valuetext={loadingLabel} max={1} {...(placeLoad.stage === 'preparing' || placeLoad.ratio === null ? {} : { value: placeLoad.ratio })} />}
    {placeLoad.stage === 'error' && <button className="btn small" onClick={() => { void run(async () => { await preparePlace(placeId, true); if (screen === 'place') await engine.previewPlace(placeId); }).catch(() => setPlaceLoad((value) => ({ ...value, stage: 'error' }))); }}>{t.retry}</button>}
  </div>;

  return (
    <div className="ui" data-screen={screen} data-controls-idle={controlsIdle} data-caught={caught}>
      <header className="topbar">
        <span className="brand"><span lang="zh-CN">一盏</span><span lang="en">One Light</span></span>
        <nav>
          <button className="btn small mute" aria-label={quiet ? t.soundOn : t.soundOff} aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>{quiet ? t.controlMuted : t.controlSound}</button>
          {screen !== 'burning' && <button className="btn small" onClick={switchLocale} aria-label={t.langSwitchLabel}>{t.langSwitch}</button>}
          <button className="btn small" onClick={() => open('stats')}>{t.tenLights}</button>
          <button className="btn small" onClick={() => open('mine')}>{t.myCandles}</button>
        </nav>
      </header>

      {pill && ['place', 'burning'].includes(screen) && (screen !== 'burning' || caught) && <div className="pill" role="status" data-testid="presence">{pill}</div>}
      {toast && (screen !== 'burning' || caught) && <div className="toast" role="status">{t.toastLit} <button className="btn small" onClick={() => { setToastMuted(true); setToast(false); }}>{t.toastMute}</button></div>}

      {screen === 'wish' && (
        <section className="sheet">
          <div className="inner">
            <div className="eyebrow">{t.wishEyebrow}</div>
            <h1>{t.wishTitle}</h1><div className="parallel" lang={locale === 'zh' ? 'en' : 'zh-CN'}>{DICTS[locale === 'zh' ? 'en' : 'zh'].wishTitle}</div>
            <p>{t.wishLead}</p>
            <textarea ref={wishField} value={wish} maxLength={60} rows={2} placeholder={t.wishPlaceholder} aria-label={t.wishLabel} aria-invalid={wishHint} aria-describedby={wishHint ? 'wish-hint' : undefined}
              onChange={(e) => { setWish(e.target.value); setWishId(null); if (e.target.value.trim()) setWishHint(false); }} />
            <div className="counter">{wish.length} / 60</div>
            {wishHint && <p className="error field-hint" id="wish-hint" role="alert">{t.wishMissing}</p>}
            <p className="note">{t.wishRules}</p>
            <button className="btn primary" disabled={busy} onClick={toPlace}>{t.wishNext}</button>
            {wish.trim() && loading(true)}
          </div>
        </section>
      )}

      {screen === 'place' && (
        <section className="sheet low">
          <div className="inner">
            <div className="eyebrow">{t.placeEyebrow}</div>
            <div className="tname">{place.name[locale]}<small lang={locale === 'zh' ? 'en' : 'zh-CN'}>{place.name[locale === 'zh' ? 'en' : 'zh']}</small></div>
            <p className="note">{place.lamp[locale]} · {place.line[locale]}</p>
            {VISIBLE_PLACES.length > 1 && <div className="places" role="radiogroup" aria-label={t.placeEyebrow}>
              {VISIBLE_PLACES.map((p) => {
                const now = placeStats?.places.find((s) => s.placeId === p.id)?.now ?? 0;
                return (
                  <button key={p.id} role="radio" aria-checked={p.id === placeId} className="place" onClick={() => pickPlace(p.id)}
                    aria-label={placeStats ? `${p.name[locale]} · ${t.placeNowCount(now)}` : p.name[locale]}>
                    <span>{p.name[locale]}</span>
                    {now > 0 && <small aria-hidden="true">{now}</small>}
                  </button>
                );
              })}
            </div>}
            <p className="note place-invitation">{t.placeLead}</p>
            {loading()}
            <div className="row place-actions">
              <button className="btn link" onClick={backToWish} disabled={busy}>{t.placeBack}</button>
              <button className="btn primary" onClick={goTravel} disabled={busy || placeLoad.stage !== 'ready'} aria-busy={busy || placeLoad.stage === 'loading' || placeLoad.stage === 'preparing'}>{busy || placeLoad.stage === 'loading' || placeLoad.stage === 'preparing' ? t.courtPreparing : t.placeGo}</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'travel' && (
        <>
          {travelTitle && <div className="travel"><div className="go">{t.travelGo}</div><div className="big">{place.name[locale]}</div><div className="where">{place.lamp[locale]}</div></div>}
          <button className="btn small skip" onClick={() => { engine.skip(); stageRef.current = 'choose'; void music.play('choose', placeIdRef.current); }}>{t.skip}</button>
        </>
      )}

      {screen === 'candle' && (
        <section className="sheet candle-sheet">
          <div className="inner">
            <div className="eyebrow">{t.candleEyebrow}</div>
            <h2>{t.stepTitle[kind]}</h2>
            <div className="tabs" role="tablist">
              <button role="tab" className="tab" aria-selected={tab === 'preset'} onClick={() => setTab('preset')}>{t.tabPresets}</button>
              <button role="tab" className="tab" aria-selected={tab === 'draw'} onClick={() => setTab('draw')}>{t.tabDraw}</button>
            </div>
            <div className="design-options">
            {tab === 'preset' ? (
              <div className="shapes" role="radiogroup" aria-label={t.tabPresets}>
                {PRESET_SHAPES[kind].map((p, i) => (
                  <button key={p.id} role="radio" aria-checked={presetShape === i} className="shape" onClick={() => setPresetShape(i)}>
                    <CandleThumb shape={{ kind, rows: sizedPreset(p.rows, preset), color: COLORS[kind][color] }} remaining={1} state="unlit" />
                    <span>{t.presetNames[kind][i]}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="draw">
                <DrawPad strokes={strokes} setStrokes={setStrokes} kind={kind} color={COLORS[kind][color]} label={t.drawHint[kind]} empty={t.drawEmpty} onPreview={setDrawingMinutes} />
                <div className="draw-side">
                  <p className="note">{t.drawHint[kind]}</p>
                  <div className="row">
                    <button className="btn small" disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>{t.drawUndo}</button>
                    <button className="btn small" disabled={!strokes.length} onClick={() => setStrokes([])}>{t.drawClear}</button>
                  </div>
                </div>
              </div>
            )}
            {tab === 'preset' && (
              <>
                <div className="eyebrow">{t.durationLabel}</div>
                <div className="sizes" role="radiogroup" aria-label={t.durationLabel}>
                  {PRESET_MINUTES.map((m) => (
                    <button key={m} role="radio" aria-checked={preset === m} className="size" onClick={() => setPreset(m)}>{fmtDuration(m * 60_000, t)}</button>
                  ))}
                </div>
              </>
            )}
            </div>
            <div className="choice-readout">
            <div className="swatches" role="radiogroup" aria-label={t.colorLabel}>
              {COLORS[kind].map((c, i) => (
                <button key={c} role="radio" aria-checked={color === i} aria-label={t.colorNames[kind][i]} className="swatch" style={{ background: `#${c.toString(16).padStart(6, '0')}` }} onClick={() => setColor(i)} />
              ))}
            </div>
            <div className="readout" aria-live="polite">
              <span className="note">{t.burnsFor}</span>
              <strong data-testid="duration">{dLabel}</strong>
              {minutes !== null && minutes < MIN_MINUTES && <span className="note">{t.tooSmall}</span>}
              {minutes === MAX_MINUTES && <span className="note">{t.atMax}</span>}
              {minutes === null && <span className="note">{t.drawNeeded}</span>}
            </div>
            </div>
            <div className="light-notes">
              <p className="note light-rule">{t.lightRule}</p>
              {minutes !== null && minutes >= 720 && <p className="note">{t.longLightNote}</p>}
              {lightError && <p className="error" role="alert">{lightError}</p>}
            </div>
            <div className="row candle-actions">
              <button className="btn" onClick={backToPlace} disabled={busy}>{t.candleBack}</button>
              <button className="btn primary" onClick={light} disabled={!allowed || busy} aria-busy={busy}>{busy ? t.lighting : t.light(dLabel)}</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'burning' && b && caught && (
        <div className="hud">
          <div className="hud-top">{place.name[locale]} · {place.lamp[locale]}</div>
          <div className="hud-bottom">
            {showWish && <div className="hud-wish">{`「${wish.trim()}」`}</div>}
            <div className="hud-meta">
            <div className="hud-time" data-testid="with-you">{t.withYou(fmtDuration(b.elapsed(), t), fmtDuration(b.planned, t))}</div>
            {showLeft && <div className="hud-left">{t.remaining(fmtClock(b.planned - b.elapsed()))}</div>}
            {!showLeft && <div className="note">{b.wakeOn ? t.wakeOn : t.wakeOff}</div>}
            </div>
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
                <button className="btn small" aria-label={quiet ? t.soundOn : t.soundOff} aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>{quiet ? t.controlMuted : t.controlSound}</button>
                <button className="btn small" aria-label={powerSaver ? t.qualityOn : t.powerSaver} aria-pressed={powerSaver} onClick={() => setPowerSaver(!powerSaver)}>{powerSaver ? t.controlSaver : t.controlDetail}</button>
                <button className="btn small" aria-label={showWish ? t.hideWish : t.showWish} aria-pressed={showWish} onClick={() => setShowWish(!showWish)}>{t.controlWish}</button>
                <button className="btn small" aria-label={showLeft ? t.hideRemaining : t.showRemaining} aria-pressed={showLeft} onClick={() => setShowLeft(!showLeft)}>{t.controlTime}</button>
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
            <p>{result.done ? t.doneLead(fmtDuration(result.plannedMs, t)) : t.outLead(fmtDuration(result.burnedMs, t, true))}</p>
            <p className="note">{result.done ? t.doneAfter : t.outAfter}</p>
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
