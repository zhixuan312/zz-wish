import { expect, test } from 'vitest';
import { observeFirstVisible } from '../../tier2/first-visible.mjs';

// A delayed API readback must not move the HUD timestamp. These cases drive the observer directly with a
// controllable clock, so the property is tested rather than the source text.

type FakeObserver = { connected: boolean; fire(): void };
function harness({ clock, initiallyPresent = false }: { clock: () => number; initiallyPresent?: boolean }) {
  const created: FakeObserver[] = [];
  let present = initiallyPresent;
  class Observer {
    connected = false;
    constructor(callback: (records: unknown[]) => void) { this.callback = callback; created.push(this); this.connected = false; }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    fire() { if (this.connected) this.callback([]); }
    callback: (records: unknown[]) => void;
  }
  const doc = {
    defaultView: { MutationObserver: Observer },
    documentElement: {},
    querySelector: () => (present ? {} : null),
  };
  const mark: { at: number | null } = { at: null };
  const handle = observeFirstVisible(doc, '[data-testid="with-you"]', mark, clock);
  return {
    mark, handle, observers: created,
    appear() { present = true; },
    fire() { for (const observer of created) observer.fire(); },
  };
}

test('the element appearing after the click is stamped when it appears', () => {
  let now = 1_000;
  const h = harness({ clock: () => now });
  expect(h.mark.at).toBeNull();
  now = 1_250;
  h.appear();
  h.fire();
  expect(h.mark.at).toBe(1_250);
});

test('a slow readback cannot move the stamp', () => {
  let now = 2_000;
  const h = harness({ clock: () => now });
  h.appear();
  h.fire();
  const stamped = h.mark.at;
  // The API readback takes 900 ms; nothing about it touches the mark.
  now += 900;
  h.fire();
  expect(h.mark.at).toBe(stamped);
});

test('an element already present is stamped immediately, without an observer', () => {
  let now = 3_000;
  const h = harness({ clock: () => now, initiallyPresent: true });
  expect(h.mark.at).toBe(3_000);
  expect(h.observers).toHaveLength(0);
});
