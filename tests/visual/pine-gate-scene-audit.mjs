import assert from 'node:assert/strict';

function insertAt(source, anchor, name, statement, before = false) {
  const matches = [...source.matchAll(anchor)];
  assert.equal(matches.length, 1, `Expected one scene audit anchor for ${name}, found ${matches.length}.`);
  const [line, indent] = matches[0];
  const replacement = before ? `${indent}${statement}\n${line}` : `${line}\n${indent}${statement}`;
  return source.replace(anchor, () => replacement);
}

const readinessAnchors = [
  ['queued', /^([ \t]*)if\s*\(\s*!preparingPlaces\.has\(id\)\s*\)\s*\{/gm, 'id'],
  ['build-started', /^([ \t]*)PLACES\[t\.id\]\s*\?\?=\s*\(await placeModules\[t\.id\]\(\)\)\.default\(placeHelpers\);/gm, 't.id', true],
  ['environment-ready', /^([ \t]*)const envTarget\s*=\s*pmrem\.fromScene\(skyScene,\s*0,\s*0?\.1,\s*(?:1000|1e3)\),\s*env\s*=\s*envTarget\.texture;/gm, 't.id'],
  ['assets-ready', /^([ \t]*)await P\.build\(t,\s*context\);\s+if\s*\(!isolated\)\s*await finishBatch\(\);/gm, 't.id'],
  ['compile-started', /^([ \t]*)try\s*\{(?=\s*await renderer\.compileAsync\(stage,\s*stageCamera\);)/gm, 't.id'],
  ['shaders-ready', /^([ \t]*)renderer\.setRenderTarget\(warm\);\s*renderer\.render\(stage,\s*stageCamera\);/gm, 't.id'],
  ['build-finished', /^([ \t]*)cachedPlaces\.set\(t\.id,\s*candidate\);/gm, 't.id'],
];

export function instrumentPineScene(source, { readiness, cadence, lighting, walkClock }) {
  if (readiness) for (const [name, anchor, id, before] of readinessAnchors) {
    const mark = `if (${id} === 'pine-gate' || ${id} === 'snow-roof') performance.mark('one-light:' + ${id} + ':${name}');`;
    source = insertAt(source, anchor, name, mark, before);
  }
  if (cadence) {
    source = insertAt(source, /^([ \t]*)composer\.render\(\);[ \t]*$/gm, 'composer render', 'window.__pineMeasureFrame?.();');
  }
  if (walkClock) {
    source = insertAt(source, /^([ \t]*)const walk\s*=\s*tween\(P\.walkSeconds\s*\?\?\s*14,\s*(?:\(k\)|k)\s*=>\s*\{/gm,
      'physical walk time', 'window.__pineCaptureWalkClock = { id, seconds: k * (P.walkSeconds ?? 14), durationSeconds: P.walkSeconds ?? 14 };');
  }
  if (lighting) {
    source = insertAt(source, /^([ \t]*)function frame\(stamp\s*=\s*performance\.now\(\)\)\s*\{/gm, 'lighting state', `window.__pineCaptureLighting = () => {
  const state = place?.baked?.lightingState();
  return state ? { placeId: place.id, agx: !!nativeAgXPass?.enabled, ...state } : null;
};`, true);
  }
  return source;
}
