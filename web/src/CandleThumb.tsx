// A small picture of a candle or lamp as it ended: the person's own outline, cut where it stopped burning.
import { waxVolume, type Shape } from '../../shared/rules.ts';

export function CandleThumb({ shape, remaining }: { shape: Shape; remaining: number }) {
  const W = 40, H = 64;
  if (shape.kind === 'lamp') {
    const fill = Math.max(0.02, shape.fill * remaining);
    return (
      <svg className="thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path d="M4 34 Q20 62 36 34 Z" fill="#c9a14f" />
        <rect x="9" y={34 - 14 * fill} width="22" height={14 * fill + 2} rx="2" fill="#e9cf8a" />
        <rect x="16" y="52" width="8" height="8" fill="#9a7642" />
      </svg>
    );
  }
  const rows = shape.rows, total = waxVolume(rows);
  let cut = rows[rows.length - 1].y;
  if (remaining < 1) {
    let acc = 0; cut = 0;
    for (let i = 1; i < rows.length; i++) { const v = waxVolume([rows[i - 1], rows[i]]); if (acc + v >= total * remaining) { cut = rows[i - 1].y + ((rows[i].y - rows[i - 1].y) * (total * remaining - acc)) / (v || 1); break; } acc += v; }
  }
  const scale = (H - 8) / 0.155, x = (v: number) => W / 2 + v * scale, y = (v: number) => H - 4 - v * scale;
  const kept = rows.filter((r) => r.y < cut);
  const i = rows.findIndex((r) => r.y >= cut), a = rows[Math.max(0, i - 1)], b = rows[Math.max(0, i)];
  const k = b.y === a.y ? 0 : (cut - a.y) / (b.y - a.y);
  kept.push({ y: cut, cx: a.cx + (b.cx - a.cx) * k, r: a.r + (b.r - a.r) * k });
  const pts = [...kept.map((r) => `${x(r.cx - r.r)},${y(r.y)}`), ...kept.reverse().map((r) => `${x(r.cx + r.r)},${y(r.y)}`)].join(' ');
  return (
    <svg className="thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polygon points={pts} fill={`#${shape.color.toString(16).padStart(6, '0')}`} stroke="rgba(238,227,209,.5)" strokeWidth="0.6" />
    </svg>
  );
}
