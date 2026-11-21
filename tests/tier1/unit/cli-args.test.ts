import { expect, test } from 'vitest';
import { parseArgs } from '../../tier2/cli-args.mjs';

const flags = new Set(['screenshots']);

test('a boolean flag is off when absent and on in every position', () => {
  expect(parseArgs(['--hour', '13'], flags).screenshots).toBeUndefined();
  // Trailing: the naive parser read the missing next token as '' and turned the feature off.
  expect(parseArgs(['--hour', '13', '--screenshots'], flags).screenshots).toBe(true);
  // Leading, before another option: the next token belongs to that option, not to the flag.
  const leading = parseArgs(['--screenshots', '--hour', '13'], flags);
  expect(leading.screenshots).toBe(true);
  expect(leading.hour).toBe('13');
  // Between options.
  const middle = parseArgs(['--hour', '13', '--screenshots', '--viewport', 'desktop'], flags);
  expect(middle.screenshots).toBe(true);
  expect(middle.viewport).toBe('desktop');
});

test('an explicit value on a boolean flag is rejected, not interpreted', () => {
  // `--screenshots false` used to be truthy, so a run asking for no captures took them.
  expect(() => parseArgs(['--screenshots', 'false'], flags)).toThrow(/takes no value/);
  expect(() => parseArgs(['--screenshots', 'true'], flags)).toThrow(/takes no value/);
  expect(() => parseArgs(['--screenshots', '0'], flags)).toThrow(/takes no value/);
});

test('value options keep their own value and never consume a flag', () => {
  const args = parseArgs(['--hour', '22', '--screenshots', '--viewport', 'phone'], flags);
  expect(args).toEqual({ hour: '22', screenshots: true, viewport: 'phone' });
});
