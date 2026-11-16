// A small picture of a lamp as it ended: the person's own outline. A candle is cut where it stopped
// burning; a dish shows the oil it had left; a shade is drawn dimmer the less of its time remained.
import { useId } from 'react';
import { waxVolume, type Row, type Shape } from '../../shared/rules.ts';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
function cutAt(rows: Row[], remaining: number) {
  const total = waxVolume(rows); let acc = 0;
  for (let i = 1; i < rows.length; i++) { const v = waxVolume([rows[i - 1], rows[i]]); if (acc + v >= total * remaining) return rows[i - 1].y + ((rows[i].y - rows[i - 1].y) * (total * remaining - acc)) / (v || 1); acc += v; }
  return rows[rows.length - 1].y;
}
function ringAt(rows: Row[], y: number): Row {
  const i = Math.max(1, rows.findIndex((r) => r.y >= y)), a = rows[i - 1], b = rows[i] ?? a, k = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
  return { y, cx: a.cx + (b.cx - a.cx) * k, r: a.r + (b.r - a.r) * k };
}

export function CandleThumb({ shape, remaining }: { shape: Shape; remaining: number }) {
  const id = useId().replaceAll(':', '');
  const W = 40, H = 64, rows = shape.rows, top = rows[rows.length - 1].y;
  const left = Math.min(...rows.map((r) => r.cx - r.r)), right = Math.max(...rows.map((r) => r.cx + r.r));
  const scale = Math.min((H - 8) / top, (W - 6) / (right - left));
  const x = (v: number) => W / 2 + (v - (left + right) / 2) * scale, y = (v: number) => H - 4 - v * scale;
  const outline = (rs: Row[]) => [...rs.map((r) => `${x(r.cx - r.r)},${y(r.y)}`), ...[...rs].reverse().map((r) => `${x(r.cx + r.r)},${y(r.y)}`)].join(' ');
  const left0 = Math.max(0, Math.min(1, remaining));
  if (shape.kind === 'candle') {
    const cut = remaining < 1 ? cutAt(rows, left0) : top;
    const kept = [...rows.filter((r) => r.y < cut), ringAt(rows, cut)];
    return <svg className="thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polygon points={outline(kept)} fill={hex(shape.color)} stroke="rgba(238,227,209,.5)" strokeWidth="0.6" /></svg>;
  }
  if (shape.kind === 'oil') {
    const level = cutAt(rows, left0 * 0.85), ring = ringAt(rows, level);
    return (
      <svg className="thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <polygon points={outline(rows)} fill={hex(shape.color)} stroke="rgba(238,227,209,.5)" strokeWidth="0.6" />
        {left0 > 0 && <line x1={x(ring.cx - ring.r * 0.9)} x2={x(ring.cx + ring.r * 0.9)} y1={y(level)} y2={y(level)} stroke="#e9cf8a" strokeWidth="1.4" />}
      </svg>
    );
  }
  // Snow Roof's shade hangs from a cord, with curved bamboo ribs, dark caps and a tassel.
  // Keep the visitor's actual outline; the light draws inward as time runs down, while the gauze stays intact.
  const shadeScale = Math.min(42 / top, 30 / (right - left));
  const sx = (v: number) => W / 2 + (v - (left + right) / 2) * shadeScale;
  const sy = (v: number) => 50 - v * shadeScale;
  const silhouette = [...rows.map((r) => `${sx(r.cx - r.r)},${sy(r.y)}`), ...[...rows].reverse().map((r) => `${sx(r.cx + r.r)},${sy(r.y)}`)].join(' ');
  const upper = rows[rows.length - 1], lower = rows[0];
  const centerY = (sy(0) + sy(top)) / 2, centerX = sx((lower.cx + upper.cx) / 2);
  return (
    <svg className="thumb shade-thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-round`} x1="0" x2="1"><stop offset="0" stopColor="#100b08" stopOpacity=".65" /><stop offset=".45" stopColor="#f1c392" stopOpacity=".08" /><stop offset="1" stopColor="#100b08" stopOpacity=".7" /></linearGradient>
        <radialGradient id={`${id}-light`}><stop offset="0" stopColor="#ffdd91" stopOpacity=".85" /><stop offset=".45" stopColor="#f4a34e" stopOpacity=".35" /><stop offset="1" stopColor="#f4a34e" stopOpacity="0" /></radialGradient>
        <clipPath id={`${id}-shape`}><polygon points={silhouette} /></clipPath>
      </defs>
      <line x1={sx(upper.cx)} x2={sx(upper.cx)} y1="0" y2={sy(top) - 1} stroke="#9a1810" strokeWidth=".7" />
      <polygon points={silhouette} fill={hex(shape.color)} stroke="#b89a6b" strokeOpacity=".5" strokeWidth=".6" />
      <polygon points={silhouette} fill={`url(#${id}-round)`} />
      {left0 > 0 && <ellipse cx={centerX} cy={centerY + 2} rx={(right - left) * shadeScale * (.12 + .35 * left0)} ry={Math.max(1, top * shadeScale * .42 * left0)} fill={`url(#${id}-light)`} clipPath={`url(#${id}-shape)`} />}
      {[-.75, -.35, .35, .75].map((rib) => <polyline key={rib} points={rows.map((r) => `${sx(r.cx + r.r * rib)},${sy(r.y)}`).join(' ')} fill="none" stroke="#382017" strokeOpacity=".7" strokeWidth=".65" />)}
      <line x1={sx(upper.cx - upper.r) - 1} x2={sx(upper.cx + upper.r) + 1} y1={sy(top)} y2={sy(top)} stroke="#261b13" strokeWidth="2.2" />
      <line x1={sx(lower.cx - lower.r) - 1} x2={sx(lower.cx + lower.r) + 1} y1={sy(0)} y2={sy(0)} stroke="#261b13" strokeWidth="2.2" />
      <line x1={sx(lower.cx)} x2={sx(lower.cx)} y1="51" y2="56" stroke="#9a1810" strokeWidth=".7" />
      <path d={`M${sx(lower.cx) - .7},56 L${sx(lower.cx) + .7},56 L${sx(lower.cx) + 2.1},62 L${sx(lower.cx) - 2.1},62 Z`} fill="#9a1810" />
    </svg>
  );
}
