// Types for the first-visible observer, which the unit tests import directly.
export function observeFirstVisible(
  doc: { documentElement: unknown; querySelector(selector: string): unknown;
    defaultView: { MutationObserver: new (callback: () => void) => { observe(target: unknown, options: object): void; disconnect(): void } } },
  selector: string,
  mark: { at: number | null },
  clock?: () => number,
): { stop(): void };
