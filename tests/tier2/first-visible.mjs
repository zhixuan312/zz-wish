// Passed directly to Locator.evaluate, so every dependency must exist in the browser realm.
export function observeFirstVisible(button, selector) {
  const doc = button.ownerDocument;
  const view = doc.defaultView;
  const mark = { clickAt: null, at: null };
  view.__ignitionProbe = mark;
  button.addEventListener('click', () => { mark.clickAt = view.performance.now(); },
    { capture: true, once: true });

  const sample = () => {
    const hud = doc.querySelector(selector);
    const bounds = hud?.getBoundingClientRect();
    if (bounds?.height > 0 && bounds.width > 0
      && hud.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
      mark.at = view.performance.now();
      return;
    }
    view.requestAnimationFrame(sample);
  };
  sample();
}
