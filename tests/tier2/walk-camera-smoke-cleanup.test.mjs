// Tests for the cleanup the smoke harness actually runs.
//
// Every case calls stopServerAndRemoveDatabase — the same function walk-camera-smoke.mjs calls from its
// finally — with stubbed safe-kill, status and removal. Nothing here re-implements the decision, so a
// regression in the real path turns these red.
import { expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopServerAndRemoveDatabase, processAlive } from './walk-camera-smoke-cleanup.mjs';

const noSleep = async () => {};

// A stub exec: safe-kill behaviour, `ps` state and `rm`/`test -e` over a real temp directory. Files are
// created on disk so "removed" and "survives" are facts, not flags.
function stubWorld({ safeKill = { status: 0, stdout: 'stopped 4242 (/tmp/x)' }, states, rmFails }) {
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
  const dbFile = join(dir, 'smoke.db');
  for (const suffix of ['', '-shm', '-wal']) writeFileSync(dbFile + suffix, 'sqlite');
  const script = {
    safeKillCalls: 0, statusCalls: 0, rmCalls: [],
    exec(file, args) {
      if (String(file).endsWith('safe-kill.sh')) {
        script.safeKillCalls++;
        if (safeKill.throwLaunch) {
          const error = new Error(safeKill.stdout ?? 'spawn failed');
          error.status = safeKill.status;
          error.stdout = safeKill.stdout;
          throw error;
        }
        if (safeKill.status === 0) return safeKill.stdout;
        const error = new Error(safeKill.stdout ?? 'non-zero');
        error.status = safeKill.status;
        error.stdout = safeKill.stdout;
        throw error;
      }
      if (file === 'sh') {
        const line = args[1];
        if (line.startsWith('ps -p')) {
          script.statusCalls++;
          if (states.throwStatus) throw new Error('ps failed');
          return states.value === 'alive' ? 'yes' : 'no';
        }
        if (line.startsWith('test -e')) return existsSync(dbFile) ? 'yes' : 'no';
        return '';
      }
      if (file === 'rm') {
        script.rmCalls.push(args[1]);
        if (!rmFails) rmSync(args[1], { force: true });
        return '';
      }
      return '';
    },
  };
  return { dir, dbFile, script };
}

test('a stopped process removes this run’s database and reports success', async () => {
  const { dir, dbFile, script } = stubWorld({ states: { value: 'gone' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(true);
  expect(report.confirmedGone).toBe(true);
  expect(report.databaseRemoved).toBe(true);
  expect(existsSync(dbFile)).toBe(false);
  expect(script.safeKillCalls).toBe(1);
  rmSync(dir, { recursive: true, force: true });
});

test('a refusal keeps the database and fails', async () => {
  const { dir, dbFile, script } = stubWorld({
    safeKill: { status: 3, stdout: 'refused 4242: cwd is not yours' }, states: { value: 'alive' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.refused).toBe(true);
  expect(report.databaseRemoved).toBe(false);
  expect(report.retainedDatabase).toBe(dbFile);
  expect(existsSync(dbFile)).toBe(true);
  expect(script.rmCalls).toHaveLength(0);
  rmSync(dir, { recursive: true, force: true });
});

test('a non-zero status with no text still means no cleanup', async () => {
  const { dir, dbFile, script } = stubWorld({ safeKill: { status: 3, stdout: '' }, states: { value: 'gone' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.refused).toBe(false);
  expect(report.exitStatus).toBe(3);
  expect(report.databaseRemoved).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a safe-kill launch failure is not success', async () => {
  const { dir, dbFile, script } = stubWorld({ safeKill: { throwLaunch: true, status: undefined }, states: { value: 'gone' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/missing/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.exitStatus).toBe('launch-failed');
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('an unknown process state is not gone, so nothing is removed', async () => {
  const { dir, dbFile, script } = stubWorld({ states: { throwStatus: true } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.processState).toBe('unknown');
  expect(report.confirmedGone).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a process that survives safe-kill keeps the database', async () => {
  const { dir, dbFile, script } = stubWorld({ states: { value: 'alive' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.processState).toBe('alive');
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a removal that fails, leaving the file, is a failure', async () => {
  const { dir, dbFile, script } = stubWorld({ states: { value: 'gone' }, rmFails: true });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.databaseRemoved).toBe(false);
  expect(report.failedRemovals.length).toBeGreaterThan(0);
  expect(report.reason).toMatch(/survived removal/);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a pre-existing file outside this run is never touched', async () => {
  // A previous refused run's database sits next to this run's scratch dir; only this run's files go.
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
  const earlier = join(dir, 'previous-run.db');
  writeFileSync(earlier, 'earlier evidence');
  const runDir = join(dir, 'this-run');
  mkdtempSync(join(dir, 'x-')); // keep dir busy
  const { mkdirSync } = await import('node:fs');
  mkdirSync(runDir, { recursive: true });
  const dbFile = join(runDir, 'smoke.db');
  writeFileSync(dbFile, 'sqlite');
  const exec = (file, args) => {
    if (String(file).endsWith('safe-kill.sh')) return 'stopped 4242';
    if (file === 'sh') {
      if (args[1].startsWith('ps -p')) return 'no';
      if (args[1].startsWith('test -e')) return existsSync(args[1].includes(dbFile) ? dbFile : earlier) ? 'yes' : 'no';
    }
    if (file === 'rm') { rmSync(args[1], { force: true }); return ''; }
    return '';
  };
  const { ok } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec, sleep: noSleep });
  expect(ok).toBe(true);
  expect(existsSync(dbFile)).toBe(false);
  expect(existsSync(earlier)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('the status query reports unknown rather than gone when it throws', () => {
  expect(processAlive(4242, () => { throw new Error('ps unavailable'); })).toBe('unknown');
  expect(processAlive(4242, () => 'yes')).toBe('alive');
  expect(processAlive(4242, () => 'no')).toBe('gone');
  expect(processAlive(4242, () => '')).toBe('unknown');
});

test('regression guard: a non-zero exit that still prints a stop line is not success', async () => {
  // The hard case: the text looks like a stop, but safe-kill exited non-zero. If the real cleanup ever
  // drops its status check and trusts the text, this alone turns red — the other non-zero cases pass
  // merely because their text is empty.
  const { dir, dbFile, script } = stubWorld({
    safeKill: { status: 3, stdout: 'stopped 4242 (/tmp/x)' }, states: { value: 'gone' } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.exitStatus).toBe(3);
  expect(report.databaseRemoved).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});
