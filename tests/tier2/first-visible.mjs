// Records the first moment a page element appears, from inside the page.
//
// Ignition timing must not depend on anything the harness does afterwards. The API readback can take hundreds
// of milliseconds; if the HUD time were read after it, a slow server would push the reported ignition later.
// This observer stamps the page clock the first time the element exists, so the readback cannot move it.
//
// Takes the document and clock so a fixture can drive it without a browser.
export function observeFirstVisible(doc, selector, mark, clock = () => performance.now()) {
  const present = () => doc.querySelector(selector) !== null;
  const stamp = () => {
    if (mark.at !== null) return true;
    if (!present()) return false;
    mark.at = clock();
    return true;
  };
  if (stamp()) return { stop() {} };

  const observer = new doc.defaultView.MutationObserver(() => { if (stamp()) observer.disconnect(); });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
  return { stop: () => observer.disconnect() };
}
