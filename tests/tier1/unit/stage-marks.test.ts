import { expect, test } from 'vitest';
import { recordStageMarks } from '../../tier2/stage-marks.mjs';

// A minimal document stand-in. The recorder only needs documentElement, querySelectorAll and the node
// surface it reads: id, dataset and classList. Driving the observer by hand makes both replacement cases
// deterministic without a browser.
type FakeNode = {
  id: string; dataset: Record<string, string>; classList: { contains(name: string): boolean };
  querySelectorAll(selector: string): FakeNode[]; querySelector(selector: string): FakeNode | null;
  children: FakeNode[];
};
function node({ id = '', classes = [], dataset = {}, children = [] }: {
  id?: string; classes?: string[]; dataset?: Record<string, string>; children?: FakeNode[];
} = {}): FakeNode {
  return {
    id,
    dataset,
    classList: { contains: name => classes.includes(name) },
    querySelectorAll: selector => {
      const found: FakeNode[] = [];
      const walk = (current: { children?: FakeNode[] }) => {
        for (const child of current.children ?? []) {
          if (selector.startsWith('.court-loading') && child.classList.contains('court-loading')
            && child.dataset.stage !== undefined) found.push(child);
          walk(child);
        }
      };
      walk({ children });
      return found;
    },
    querySelector: selector => {
      if (selector !== '#cover-poster') return null;
      let hit: FakeNode | null = null;
      const walk = (current: { children?: FakeNode[] }) => {
        if (hit) return;
        for (const child of current.children ?? []) {
          if (child.id === 'cover-poster') { hit = child; return; }
          walk(child);
        }
      };
      walk({ children });
      return hit;
    },
    children,
  };
}

// Captures the callback and the observed options, so the test decides when a mutation "happens".
type MutationRecordLike = { type: string; addedNodes?: FakeNode[]; target?: FakeNode };
class FakeObserver {
  callback: (records: MutationRecordLike[]) => void;
  target?: unknown;
  options?: object;
  constructor(callback: (records: MutationRecordLike[]) => void) {
    this.callback = callback;
    fakeObserverState.calls.push(this);
  }
  observe(target: unknown, options: object) { this.target = target; this.options = options; }
  fire(records: MutationRecordLike[]) { this.callback(records); }
}
const fakeObserverState: { calls: FakeObserver[] } = { calls: [] };
function fakeObserver() {
  fakeObserverState.calls.length = 0;
  return { Observer: FakeObserver, calls: fakeObserverState.calls };
}

function docWith(children: FakeNode[]) {
  const root = node({ id: 'root', children });
  const doc = { documentElement: root, querySelectorAll: (sel: string) => root.querySelectorAll(sel) };
  return doc as typeof doc & { __stageMarks?: unknown };
}

test('a ready poster inserted inside a wrapper is recorded, not the wrapper', () => {
  const { Observer, calls } = fakeObserver();
  const doc = docWith([]);
  const marks = recordStageMarks(doc, Observer);
  const poster = node({ id: 'cover-poster', dataset: { ready: 'true' } });
  const wrapper = node({ children: [poster] });
  calls[0].fire([{ type: 'childList', addedNodes: [wrapper] }]);
  // The old code passed the wrapper, whose dataset has no `ready`, so this mark was lost.
  expect(marks.coverReady).toBeDefined();
  expect((marks.coverReady as { value: boolean }).value).toBe(true);
});

test('the pill is followed across replacement and every stage keeps its order', () => {
  const { Observer, calls } = fakeObserver();
  const doc = docWith([]);
  const marks = recordStageMarks(doc, Observer);
  const first = node({ classes: ['court-loading'], dataset: { stage: 'loading' } });
  calls[0].fire([{ type: 'childList', addedNodes: [first] }]);
  calls[0].fire([{ type: 'attributes', target: first }]);
  first.dataset.stage = 'preparing';
  calls[0].fire([{ type: 'attributes', target: first }]);
  // React replaces the node when the screen changes; a bound-to-first-node observer would stop here.
  const second = node({ classes: ['court-loading'], dataset: { stage: 'ready' } });
  calls[0].fire([{ type: 'childList', addedNodes: [second] }]);
  expect(marks.stageOrder.map(entry => entry.value)).toEqual(['loading', 'preparing', 'ready']);
  expect((marks['stage-ready'] as { value: string }).value).toBe('ready');
});

test('a pill replaced during parsing is recorded when the root starts empty', () => {
  const { Observer, calls } = fakeObserver();
  // documentElement is null at init-script time: the document has no root yet.
  const doc = { documentElement: null as FakeNode | null, querySelectorAll: () => [] as FakeNode[],
    defaultView: undefined as unknown };
  const marks = recordStageMarks(doc, Observer);
  // The observer must be on the Document, not on a root that does not exist yet.
  expect(calls[0].target).toBe(doc);
  const first = node({ classes: ['court-loading'], dataset: { stage: 'loading' } });
  const root = node({ id: 'root', children: [first] });
  calls[0].fire([{ type: 'childList', addedNodes: [root] }]);
  // The pill is replaced before readystatechange ever fires; no wait was needed to catch it.
  const second = node({ classes: ['court-loading'], dataset: { stage: 'ready' } });
  calls[0].fire([{ type: 'childList', addedNodes: [second] }]);
  expect(marks.stageOrder.map(entry => entry.value)).toEqual(['loading', 'ready']);
  expect((marks['stage-ready'] as { value: string }).value).toBe('ready');
});

test('the marks are published for the harness to read', () => {
  const { Observer } = fakeObserver();
  const doc = docWith([node({ id: 'cover-poster', dataset: { ready: 'true' } })]);
  const marks = recordStageMarks(doc, Observer);
  // An init script returns nothing, so the harness can only see the marks through a global.
  expect(doc.__stageMarks).toBe(marks);
});

test('a poster already in the document at first paint is read by the initial scan', () => {
  const { Observer } = fakeObserver();
  const poster = node({ id: 'cover-poster', dataset: { ready: 'true' } });
  const pill = node({ classes: ['court-loading'], dataset: { stage: 'preparing' } });
  const doc = docWith([poster, pill]);
  const marks = recordStageMarks(doc, Observer);
  expect(marks.coverReady).toBeDefined();
  expect(marks.stageOrder.map(entry => entry.value)).toEqual(['preparing']);
});
