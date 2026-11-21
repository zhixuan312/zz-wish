// CPU-side stage recording for the tier2 harnesses.
//
// The page publishes two facts the harness can read without touching product code:
//   - `#cover-poster[data-ready="true"]`, set inside ensureReady after showPlace, compileAsync and the next
//     frame. It is a cumulative "cover usable" mark, never a compile duration.
//   - `[data-stage]` on the loading pill, which is the prepare stage.
//
// Two things make naive observation wrong:
//   - App mounts the pill twice, once while the wish is written and once on the place screen, so React
//     replaces the node. An observer bound to the first node misses every later stage.
//   - A subtree can be inserted that already contains a ready poster. The insertion record's target is the
//     wrapper, so the record must be resolved to the poster itself; reading the wrapper finds no
//     `dataset.ready` and silently loses the first, already-ready paint.
//
// This module takes the document and the observer as arguments so the replacement cases can be driven in a
// test without a browser.
export function recordStageMarks(doc, Observer = globalThis.MutationObserver) {
  const marks = { t0: performance.now(), stageOrder: [] };
  const stamp = (name, at, value) => { if (!(name in marks)) marks[name] = { at, value }; };

  const readPoster = node => {
    if (node?.dataset?.ready === 'true') stamp('coverReady', performance.now(), true);
  };

  const readStage = node => {
    const stage = node?.dataset?.stage;
    if (!stage) return;
    if (!marks.stageOrder.some(entry => entry.value === stage)) {
      marks.stageOrder.push({ value: stage, at: performance.now() });
    }
    stamp('stage-' + stage, performance.now(), stage);
  };

  // Resolve any node to the poster it is, or the one it contains.
  const posterIn = node => (node?.id === 'cover-poster' ? node : node?.querySelector?.('#cover-poster') ?? null);
  // React may mount the pill as a parent or nest it; both are the same stage source.
  const stagesIn = node => {
    const found = [];
    if (node?.classList?.contains('court-loading')) found.push(node);
    for (const inner of node?.querySelectorAll?.('.court-loading[data-stage]') ?? []) found.push(inner);
    return found;
  };

  const scan = container => {
    const poster = posterIn(container);
    if (poster) readPoster(poster);
    for (const node of container?.querySelectorAll?.('.court-loading[data-stage]') ?? []) readStage(node);
  };

  // Publish immediately: the harness reads it later, and an init script has no return value. The fixture has
  // no window, so the marks are also exposed on the document stand-in.
  if (doc.defaultView) doc.defaultView.__stageMarks = marks;
  else doc.__stageMarks = marks;
  const observer = new Observer(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (target?.id === 'cover-poster') readPoster(target);
        else if (target?.classList?.contains('court-loading')) readStage(target);
        continue;
      }
      for (const added of record.addedNodes) {
        const poster = posterIn(added);
        if (poster) readPoster(poster);
        for (const node of stagesIn(added)) readStage(node);
      }
    }
  });
  // At init-script time documentElement may not exist yet; observe once it does.
  const start = () => {
    observer.observe(doc.documentElement, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['data-stage', 'data-ready'] });
    scan(doc.documentElement);
  };
  if (doc.documentElement) start();
  else doc.addEventListener('readystatechange', function once() {
    doc.removeEventListener('readystatechange', once);
    start();
  });
  return marks;
}
