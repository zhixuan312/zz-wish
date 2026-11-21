import { expect, test } from 'vitest';
import { diagnosisProblems } from '../../tier2/diagnosis-problems.mjs';
import { observeFirstVisible } from '../../tier2/first-visible.mjs';

function fixture(initiallyVisible = false) {
  let visible = initiallyVisible;
  let now = 100;
  let click: (() => void) | undefined;
  const frames: Array<() => void> = [];
  const view = {
    performance: { now: () => now },
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); },
    __ignitionProbe: null as null | { at: number | null; clickAt: number | null },
  };
  const hud = {
    getBoundingClientRect: () => ({ height: 10, width: 20 }),
    checkVisibility: () => visible,
  };
  const button = {
    ownerDocument: { defaultView: view, querySelector: () => hud },
    addEventListener: (_event: string, callback: () => void) => { click = callback; },
  };
  observeFirstVisible(button as unknown as HTMLElement, '[data-testid="with-you"]');
  return {
    get mark() { return view.__ignitionProbe; },
    clickLight(at: number) { now = at; click?.(); },
    reveal() { visible = true; },
    frame(at: number) { now = at; frames.shift()?.(); },
  };
}

test('HUD present but hidden is stamped on the first visible frame', () => {
  const hud = fixture();
  hud.clickLight(120);
  hud.frame(130);
  expect(hud.mark).toEqual({ clickAt: 120, at: null });
  hud.reveal();
  hud.frame(150);
  expect(hud.mark).toEqual({ clickAt: 120, at: 150 });
});

test('a later API readback does not change the HUD timestamp', async () => {
  const hud = fixture();
  hud.clickLight(120);
  hud.reveal();
  hud.frame(150);
  let resolveReadback!: (placeId: string) => void;
  const readback = new Promise<string>(resolve => { resolveReadback = resolve; });
  hud.frame(1050);
  resolveReadback('snow-roof');
  expect(await readback).toBe('snow-roof');
  expect(hud.mark).toEqual({ clickAt: 120, at: 150 });
});

test('HUD already visible at setup is stamped before the click and invalidates the run', () => {
  const hud = fixture(true);
  expect(hud.mark).toEqual({ clickAt: null, at: 100 });
  hud.clickLight(120);
  const problems = diagnosisProblems({
    lightClockPinned: true, moved: true, ignited: true,
    selectedPlaceId: 'snow-roof', activeCandle: { placeId: 'snow-roof' },
    lightClickAt: hud.mark?.clickAt, ignitionHudAt: hud.mark?.at,
  }, 13);
  expect(problems).toEqual(['ignition HUD was visible before the light click']);
});
