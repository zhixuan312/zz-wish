// Thumbnails use the same 3D vessel geometry and materials as the live lamp.
// The engine owns one shared renderer and render target; cards never create WebGL contexts.
import { useEffect, useRef, useState } from 'react';
import type { Shape } from '../../shared/rules.ts';
import { renderLampThumbnail } from './engine/index.ts';

export type ThumbnailState = 'unlit' | 'burning' | 'went_out' | 'burned_down';
const pictures = new Map<string, Promise<string>>();

export function CandleThumb({ shape, remaining, state }: { shape: Shape; remaining: number; state: ThumbnailState }) {
  const level = Math.max(0, Math.min(1, remaining));
  const key = JSON.stringify({ shape, state, remaining: Math.round(level * 1000) / 1000 });
  const [picture, setPicture] = useState<{ key: string; url: string } | null>(null);
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '160px' });
    observer.observe(element.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let task = pictures.get(key);
    if (!task) {
      task = renderLampThumbnail(shape, { state, remaining: level, width: 120, height: 180 });
      pictures.set(key, task);
      if (pictures.size > 96) pictures.delete(pictures.keys().next().value!);
      void task.catch(() => { pictures.delete(key); });
    }
    void task.then((url) => { if (active) setPicture({ key, url }); }).catch(() => {});
    return () => { active = false; };
    // The serialized key includes all shape rows, colour, state and visible fuel.
  }, [key, shape, state, level, visible]);
  const url = picture?.key === key ? picture.url : null;
  return <span ref={element} className={`thumb${shape.kind === 'shade' ? ' shade-thumb' : ''}`} aria-hidden="true" data-lamp-state={state} data-ready={!!url}>
    {url && <img src={url} alt="" draggable={false} width={120} height={180} />}
  </span>;
}
