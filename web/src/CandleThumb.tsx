// A small picture of a lamp as it ended: the person's own outline. A candle is cut where it stopped
// burning; a dish shows the oil it had left; a shade is drawn dimmer the less of its time remained.
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
  return <svg className="thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polygon points={outline(rows)} fill={hex(shape.color)} fillOpacity={0.35 + 0.65 * left0} stroke="rgba(238,227,209,.5)" strokeWidth="0.6" /></svg>;
}
