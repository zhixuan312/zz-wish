// Types for the tier2 stage recorder, which the unit tests import directly.
export function recordStageMarks(
  doc: { documentElement: unknown; querySelectorAll(selector: string): unknown[] },
  Observer?: new (callback: (records: unknown[]) => void) => { observe(target: unknown, options: object): void },
): {
  t0: number;
  stageOrder: { value: string; at: number }[];
  [mark: string]: unknown;
};
