// Event and animation-frame regression for the sampler, run offline with a simulated page.
//
// The bug this pins: marking the click after `await step.click()` is too late. Animation frames run
// between the dispatch and the promise resolving, and the first moving frame overwrites the reference.
// These tests install the real page functions against a fake DOM and a fake rAF queue, dispatch a click,
// and advance frames in that order, so a late mark shows up as a lost first movement.
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { pageSampler, pageArmClickCapture, pageCollect, samplesFromSnapshot }
  from './walk-camera-sampler.mjs';
import { judgeCameraMotion } from './walk-camera-judge.mjs';

function viewMatrixAt(position) {
  const camera = new THREE.PerspectiveCamera(50, 1, .01, 1000);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(new THREE.Vector3(position.x, position.y, position.z - 1));
  camera.updateMatrixWorld(true);
  return [...camera.matrixWorldInverse.elements];
}

// A page with one Step button, one other button, one camera object the test can move, and a manual
// animation-frame queue. Times come from a controllable clock so the order is exact.
function makePage() {
  const clock = { now: 1000 };
  const rafQueue = [];
  const listeners = new Map();
  const camera = { matrixWorldInverse: { elements: viewMatrixAt({ x: 0, y: 5, z: 10 }) } };
  const makeButton = label => {
    const node = {
      textContent: label,
      _handlers: [],
      addEventListener(type, handler, capture) {
        this._handlers.push({ type, handler, capture });
        listeners.set(`${label}:${type}:${capture}`, handler);
      },
      removeEventListener(type, handler, capture) {
        this._handlers = this._handlers.filter(entry =>
          !(entry.type === type && entry.handler === handler && entry.capture === capture));
        listeners.delete(`${label}:${type}:${capture}`);
      },
      dispatch() {
        // Real order at the target: capture listeners first in registration order, then bubble listeners
        // in registration order. A sampler listening in the bubble phase therefore runs after the app
        // handler that was registered earlier, which is what makes the phase choice observable.
        const ordered = [...this._handlers].sort((a, b) => Number(b.capture) - Number(a.capture));
        for (const entry of ordered) entry.handler();
      },
    };
    return node;
  };
  const step = makeButton('Step inside');
  const other = makeButton('Light it');

  globalThis.window = { __pineRenderCamera: camera, __walkSamplerState: undefined };
  globalThis.performance = { now: () => clock.now };
  globalThis.requestAnimationFrame = callback => { rafQueue.push(callback); return rafQueue.length; };
  globalThis.document = { querySelectorAll: selector => (selector === 'button' ? [step, other] : []) };

  return {
    clock, rafQueue, step, other, camera,
    // One frame: time passes first, then the callbacks observe the later clock, which is what a real
    // animation frame does. Without the advance the reference and the click share a timestamp.
    frame(deltaMs = 16) {
      clock.now += deltaMs;
      const batch = rafQueue.splice(0);
      for (const cb of batch) cb();
    },
    moveTo(z) { camera.matrixWorldInverse.elements = viewMatrixAt({ x: 0, y: 5, z }); },
    handlerCount(label, type) { return listeners.has(`${label}:${type}:true`) ? 1 : 0; },
  };
}

// Note on phase: the sampler's tick copies the reference every frame, so `state.reference` is always the
// array from before the dispatch and the freeze is correct in either phase. What the capture phase actually
// buys is the timestamp: marking inside the dispatch sets clickAt before any post-click frame can run.
// The late-mark regression below is what these tests guard.
test('a click that moves the camera immediately keeps the pre-click reference', () => {
  const page = makePage();
  pageSampler();
  // The app's own handler is attached when the component mounts, so it is registered before the sampler
  // arms. That is the order the capture phase has to beat.
  const appHandler = () => page.camera.matrixWorldInverse.elements = viewMatrixAt({ x: 0, y: 5, z: 9.99 });
  page.step.addEventListener('click', appHandler, false);
  // Two still frames establish the reference.
  page.frame(); page.frame();
  expect(pageArmClickCapture('Step inside')).toEqual({ armed: true });
  const beforeDispatch = page.clock.now;
  page.step.dispatch();
  // A frame runs after the click but before any later mark would have happened.
  page.frame();
  page.frame();

  const snapshot = pageCollect();
  const { samples } = samplesFromSnapshot(snapshot);
  // The click was stamped inside the dispatch, so the frozen reference is the frame that was already on
  // screen and never the frame the app's handler moved. It may share the click's timestamp, which is why
  // the assertion is <= 0 rather than < 0.
  expect(snapshot.clickAt).toBe(beforeDispatch);
  expect(samples[0].t).toBeLessThanOrEqual(0);
  // The reference still shows the pre-click position, not the 1 cm the handler just applied.
  expect(samples[0].elements[14]).not.toBeCloseTo(samples[1].elements[14], 6);
  expect(samples.length).toBe(3);
  const verdict = judgeCameraMotion(samples);
  expect(verdict.verdict).toBe('moving');
  // 10 mm of travel is already past the threshold at the first post-click frame.
  expect(verdict.firstExceedance).toBe(16);
});

test('clicking another button does not mark the click, and the listener stays armed', () => {
  const page = makePage();
  pageSampler();
  page.frame(); page.frame();
  expect(pageArmClickCapture('Step inside')).toEqual({ armed: true });
  page.other.dispatch();
  page.frame();
  expect(page.clock.now).toBeGreaterThan(0);
  const snapshot = pageCollect();
  expect(snapshot.clickAt).toBeNull();
  const { samples, reasons } = samplesFromSnapshot(snapshot);
  expect(samples).toEqual([]);
  expect(reasons.join(' ')).toMatch(/click was never marked/);
  expect(judgeCameraMotion(samples).verdict).toBe('unknown');
});

test('arming without the sampler installed reports why', () => {
  globalThis.window = {};
  expect(pageArmClickCapture('Step inside')).toEqual({ armed: false, reason: 'sampler is not installed' });
});

test('arming without a matching button reports why', () => {
  const page = makePage();
  pageSampler();
  page.frame();
  expect(pageArmClickCapture('No such button')).toEqual({ armed: false, reason: 'no Step button with that label' });
});

test('the capture listener removes itself after firing, so a second click cannot re-freeze', () => {
  const page = makePage();
  pageSampler();
  page.frame();
  pageArmClickCapture('Step inside');
  page.step.dispatch();
  expect(page.handlerCount('Step inside', 'click')).toBe(0);
  page.frame();
  page.step.dispatch();
  expect(pageCollect().clickAt).not.toBeNull();
});

test('a broken pre-click reference is not replaced by a later valid frame', () => {
  const page = makePage();
  pageSampler();
  page.frame(); page.frame();
  pageArmClickCapture('Step inside');
  // Corrupt the reference before the click, then click and move normally.
  globalThis.window.__walkSamplerState.reference = [1, 2, 3];
  page.step.dispatch();
  page.moveTo(9.9);
  page.frame(); page.frame();
  const snapshot = pageCollect();
  const { samples, reasons } = samplesFromSnapshot(snapshot);
  expect(samples).toEqual([]);
  expect(reasons.join(' ')).toMatch(/not sixteen finite elements/);
  expect(judgeCameraMotion(samples).verdict).toBe('unknown');
});

test('the reference is exactly sixteen finite elements', () => {
  const page = makePage();
  pageSampler();
  page.frame();
  page.frame();
  const reference = globalThis.window.__walkSamplerState.reference;
  expect(reference).toHaveLength(16);
  expect(reference.every(Number.isFinite)).toBe(true);
});

test('timestamps keep their fractional part', () => {
  const page = makePage();
  pageSampler();
  page.frame(16.4); page.frame(16.6);
  pageArmClickCapture('Step inside');
  page.step.dispatch();
  page.frame(16.35);
  const { samples } = samplesFromSnapshot(pageCollect());
  const fractional = samples.some(sample => !Number.isInteger(sample.t));
  expect(fractional).toBe(true);
});

test('one reference and one valid frame is enough to decide', () => {
  const page = makePage();
  pageSampler();
  page.frame(); page.frame();
  pageArmClickCapture('Step inside');
  page.step.dispatch();
  page.moveTo(9.99);
  page.frame();
  const { samples, reasons } = samplesFromSnapshot(pageCollect());
  expect(samples).toHaveLength(2);
  expect(reasons.join(' ')).not.toMatch(/only 2 sample/);
  expect(judgeCameraMotion(samples).verdict).toBe('moving');
});
