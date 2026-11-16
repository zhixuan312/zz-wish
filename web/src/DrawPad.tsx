// The drawing pad: a 10 x 15 cm area. Strokes become the candle's outline row by row (the prototype's method).
import { useEffect, useRef } from 'react';
import { MIN_RADIUS, PAD, type Row } from '../../shared/rules.ts';

type Pt = { x: number; y: number };
const PAD_ROWS = 60;

function outline(strokes: Pt[][]) {
  const pts: Pt[] = [];
  for (const s of strokes) for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[i], n = Math.max(1, Math.ceil(Math.hypot((b.x - a.x) * 2, b.y - a.y) / 0.004));
    for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const lo = new Array<number>(PAD_ROWS).fill(Infinity), hi = new Array<number>(PAD_ROWS).fill(-Infinity);
  for (const p of pts) { const j = Math.min(PAD_ROWS - 1, Math.floor(p.y * PAD_ROWS)); lo[j] = Math.min(lo[j], p.x); hi[j] = Math.max(hi[j], p.x); }
  const filled = lo.map((v, j) => (v < Infinity ? j : -1)).filter((j) => j >= 0);
  if (filled.length < 2 || filled[filled.length - 1] - filled[0] < 3) return null;
  const top = filled[0], bot = filled[filled.length - 1];
  for (let j = top; j <= bot; j++) if (lo[j] === Infinity) {
    const a = filled.filter((q) => q < j).pop()!, b = filled.find((q) => q > j)!, k = (j - a) / (b - a);
    lo[j] = lo[a] + (lo[b] - lo[a]) * k; hi[j] = hi[a] + (hi[b] - hi[a]) * k;
  }
  const L: number[] = [], H: number[] = [];
  for (let j = top; j <= bot; j++) { const a = Math.max(top, j - 1), b = Math.min(bot, j + 1); L.push((lo[a] + lo[j] + lo[b]) / 3); H.push((hi[a] + hi[j] + hi[b]) / 3); }
  return { top, bot, L, H };
}

export function rowsFromStrokes(strokes: Pt[][]): Row[] | null {
  const o = outline(strokes);
  if (!o) return null;
  const dy = PAD.h / PAD_ROWS, n = o.bot - o.top, base = (o.L[n] + o.H[n]) / 2, rows: Row[] = [];
  for (let i = n; i >= 0; i--) {
    const cx = ((o.L[i] + o.H[i]) / 2 - base) * PAD.w, r = Math.max(MIN_RADIUS, ((o.H[i] - o.L[i]) / 2) * PAD.w);
    rows.push({ y: (n - i) * dy, cx, r: Math.min(r, PAD.w / 2) });
  }
  rows.push({ ...rows[rows.length - 1], y: (n + 1) * dy });
  return rows;
}

export function DrawPad({ strokes, setStrokes, color, label, empty }: { strokes: Pt[][]; setStrokes: (s: Pt[][]) => void; color: number; label: string; empty: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Pt[][]>(strokes);
  const drawing = useRef<Pt[] | null>(null);
  live.current = drawing.current ? live.current : strokes;

  const paint = () => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d')!, W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(238,227,209,.12)'; g.lineWidth = 1;
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo((W * i) / 3, 0); g.lineTo((W * i) / 3, H); g.stroke(); }
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, (H * i) / 6); g.lineTo(W, (H * i) / 6); g.stroke(); }
    const s = live.current, o = s.length ? outline(s) : null;
    if (o) {
      g.beginPath(); const rowH = H / PAD_ROWS;
      o.L.forEach((x, i) => g.lineTo(x * W, (o.top + i + 0.5) * rowH));
      for (let i = o.H.length - 1; i >= 0; i--) g.lineTo(o.H[i] * W, (o.top + i + 0.5) * rowH);
      g.closePath(); g.fillStyle = `#${color.toString(16).padStart(6, '0')}99`; g.fill();
    }
    g.strokeStyle = '#eee3d1'; g.lineWidth = 2.2 * dpr; g.lineCap = g.lineJoin = 'round';
    for (const st of s) { g.beginPath(); st.forEach((p, i) => (i ? g.lineTo(p.x * W, p.y * H) : g.moveTo(p.x * W, p.y * H))); if (st.length === 1) g.lineTo(st[0].x * W + 0.5, st[0].y * H); g.stroke(); }
    if (!s.length) { g.fillStyle = 'rgba(238,227,209,.42)'; g.font = `${14 * dpr}px serif`; g.textAlign = 'center'; g.fillText(empty, W / 2, H / 2); }
  };

  useEffect(paint);
  useEffect(() => { const on = () => paint(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); });

  const pt = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const end = () => { if (!drawing.current) return; drawing.current = null; setStrokes(live.current); };

  return (
    <canvas ref={ref} className="pad" aria-label={label}
      onPointerDown={(e) => { ref.current!.setPointerCapture(e.pointerId); drawing.current = [pt(e)]; live.current = [...strokes, drawing.current]; paint(); }}
      onPointerMove={(e) => { if (!drawing.current) return; drawing.current.push(pt(e)); paint(); }}
      onPointerUp={end} onPointerCancel={end} />
  );
}

export type { Pt };
