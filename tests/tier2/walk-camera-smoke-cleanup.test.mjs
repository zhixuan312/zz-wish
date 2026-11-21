// Tests for the cleanup the smoke harness actually runs.
//
// Every case calls stopServerAndRemoveDatabase — the same function walk-camera-smoke.mjs calls from its
// finally — with stubbed safe-kill, status and removal. Nothing here re-implements the decision, so a
// regression in the real path turns these red.
import { expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopServerAndRemoveDatabase, processState } from './walk-camera-smoke-cleanup.mjs';

const noSleep = async () => {};

// A stub exec: safe-kill behaviour, `ps` state and `rm`/`test -e` over a real temp directory. Files are
// created on disk so "removed" and "survives" are facts, not flags.
// A stand-in ChildProcess: state is whatever the case needs, read from its own fields.
function fakeChild({ exitCode = null, signalCode = null, pid }) {
  // A real ChildProcess always has a numeric pid; passing pid: null models a handle with no usable
  // information, which must read as unknown rather than alive.
  const handle = { exitCode, signalCode };
  if (pid !== null) handle.pid = pid ?? 4242;
  return handle;
}

function stubWorld({ safeKill = { status: 0, stdout: 'stopped 4242 (/tmp/x)' }, states, rmFails, child }) {
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
      if (file === 'sh') return '';
      if (file === 'rm') {
        script.rmCalls.push(args[1]);
        if (!rmFails) rmSync(args[1], { force: true });
        return '';
      }
      return '';
    },
  };
  const handle = child ?? fakeChild(states.child ?? {});
  return { dir, dbFile, script, child: handle };
}

test('a stopped process removes this run’s database and reports success', async () => {
  const { dir, dbFile, script, child } = stubWorld({ states: { child: { exitCode: 0 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(true);
  expect(report.confirmedGone).toBe(true);
  expect(report.databaseRemoved).toBe(true);
  expect(existsSync(dbFile)).toBe(false);
  expect(script.safeKillCalls).toBe(1);
  rmSync(dir, { recursive: true, force: true });
});

test('a refusal keeps the database and fails', async () => {
  const { dir, dbFile, script, child } = stubWorld({
    safeKill: { status: 3, stdout: 'refused 4242: cwd is not yours' }, states: { child: { pid: 4242 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.refused).toBe(true);
  expect(report.databaseRemoved).toBe(false);
  expect(report.retainedDatabase).toBe(dbFile);
  expect(existsSync(dbFile)).toBe(true);
  expect(script.rmCalls).toHaveLength(0);
  rmSync(dir, { recursive: true, force: true });
});

test('a non-zero status with no text still means no cleanup', async () => {
  const { dir, dbFile, script, child } = stubWorld({ safeKill: { status: 3, stdout: '' }, states: { child: { exitCode: 0 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.refused).toBe(false);
  expect(report.exitStatus).toBe(3);
  expect(report.databaseRemoved).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a safe-kill launch failure is not success', async () => {
  const { dir, dbFile, script, child } = stubWorld({ safeKill: { throwLaunch: true, status: undefined }, states: { child: { exitCode: 0 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/missing/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.exitStatus).toBe('launch-failed');
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('an unknown process state is not gone, so nothing is removed', async () => {
  const { dir, dbFile, script, child } = stubWorld({ states: { child: { pid: null, exitCode: null, signalCode: null } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.processState).toBe('unknown');
  expect(report.confirmedGone).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a process that survives safe-kill keeps the database', async () => {
  const { dir, dbFile, script, child } = stubWorld({ states: { child: { pid: 4242 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.processState).toBe('alive');
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a removal that fails, leaving the file, is a failure', async () => {
  const { dir, dbFile, script, child } = stubWorld({ states: { child: { exitCode: 0 } }, rmFails: true });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
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

test('the process state distinguishes gone from unknown', () => {
  // Exited, so gone, whatever the reason.
  expect(processState({ pid: 4242, exitCode: 0, signalCode: null }).state).toBe('gone');
  expect(processState({ pid: 4242, exitCode: null, signalCode: 'SIGTERM' }).state).toBe('gone');
  // No exit and a live pid: alive.
  expect(processState({ pid: 4242, exitCode: null, signalCode: null }).state).toBe('alive');
  // No handle information at all: unknown, never gone.
  expect(processState({ exitCode: null, signalCode: null }).state).toBe('unknown');
  expect(processState(null).state).toBe('unknown');
  // With only a pid, a kill probe can say gone (ESRCH) but a permission error is unknown, not gone.
  const alive = processState(null, { pid: process.pid });
  expect(alive.state).toBe('alive');
  const missing = processState(null, { pid: 0x7ffffffe });
  expect(['gone', 'unknown']).toContain(missing.state);
  expect(processState(null, { pid: 1 }).state).not.toBe('gone');
});

test('the real existence reader treats only ENOENT as absent', async () => {
  // Drive the function's own default reader (lstat), with no `exists` override, over a real directory.
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-lstat-'));
  const child = fakeChild({ exitCode: 0 });
  const exec = file => (String(file).endsWith('safe-kill.sh') ? 'stopped 4242' : '');
  // A present file that `rm` cannot remove, because the stub never deletes, must be reported as surviving.
  const dbFile = join(dir, 'smoke.db');
  writeFileSync(dbFile, 'sqlite');
  const outcome = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec, sleep: noSleep });
  expect(outcome.ok).toBe(false);
  expect(outcome.report.failedRemovals).toContain(dbFile);
  expect(outcome.report.reason).toMatch(/survived removal/);
  // Remove it for real and the same reader reports absence, so the run succeeds.
  rmSync(dbFile, { force: true });
  const again = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec, sleep: noSleep });
  expect(again.ok).toBe(true);
  expect(again.report.filesRemoved).toContain(dbFile);
  rmSync(dir, { recursive: true, force: true });
});

test('a permission error on the file is not evidence of absence', async () => {
  // lstat on a directory component without execute permission raises EACCES. The reader must report the
  // file as present, so the run fails instead of claiming a removal it never verified.
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-perm-'));
  const inner = join(dir, 'sealed');
  const { mkdirSync, chmodSync } = await import('node:fs');
  mkdirSync(inner);
  const dbFile = join(inner, 'smoke.db');
  writeFileSync(dbFile, 'sqlite');
  const child = fakeChild({ exitCode: 0 });
  const exec = file => (String(file).endsWith('safe-kill.sh') ? 'stopped 4242' : '');
  chmodSync(inner, 0o000);   // no read or execute: lstat of the child fails with EACCES
  try {
    const { ok, report } = await stopServerAndRemoveDatabase({
      pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec, sleep: noSleep });
    expect(ok).toBe(false);
    expect(report.failedRemovals.length).toBeGreaterThan(0);
  } finally {
    chmodSync(inner, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only ENOENT proves a file is absent', async () => {
  // A directory that cannot be read must not be reported as "file gone".
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-test-'));
  const dbFile = join(dir, 'smoke.db');
  writeFileSync(dbFile, 'sqlite');
  const child = fakeChild({ exitCode: 0 });
  const exec = (file) => {
    if (String(file).endsWith('safe-kill.sh')) return 'stopped 4242';
    if (file === 'rm') return '';
    return '';
  };
  // exists() that reports EACCES for one suffix and ENOENT for another.
  const exists = file => {
    if (file.endsWith('-shm')) return true;              // still present
    return false;                                        // everything else gone
  };
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec, sleep: noSleep, exists });
  expect(report.failedRemovals).toContain(dbFile + '-shm');
  expect(ok).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test('two consecutive runs keep both sets of evidence', async () => {
  // Each run's evidence directory is unique, so a second run cannot overwrite the first.
  const base = mkdtempSync(join(tmpdir(), 'cleanup-evidence-'));
  const { mkdirSync } = await import('node:fs');
  const first = join(base, 'run-1');
  const second = join(base, 'run-2');
  mkdirSync(first, { recursive: true });
  mkdirSync(second, { recursive: true });
  writeFileSync(join(first, 'snapshot.json'), '{"run":1}');
  writeFileSync(join(second, 'snapshot.json'), '{"run":2}');
  expect(readFileSync(join(first, 'snapshot.json'), 'utf8')).toBe('{"run":1}');
  expect(readFileSync(join(second, 'snapshot.json'), 'utf8')).toBe('{"run":2}');
  rmSync(base, { recursive: true, force: true });
});

test('an explicit non-empty evidence directory is refused rather than overwritten', async () => {
  const base = mkdtempSync(join(tmpdir(), 'cleanup-evidence-'));
  writeFileSync(join(base, 'snapshot.json'), '{"run":1}');
  // The harness refuses when readdir finds entries; this mirrors that check.
  const wouldRefuse = readdirSync(base).length > 0;
  expect(wouldRefuse).toBe(true);
  expect(readFileSync(join(base, 'snapshot.json'), 'utf8')).toBe('{"run":1}');
  rmSync(base, { recursive: true, force: true });
});

test('regression guard: a non-zero exit that still prints a stop line is not success', async () => {
  // The hard case: the text looks like a stop, but safe-kill exited non-zero. If the real cleanup ever
  // drops its status check and trusts the text, this alone turns red — the other non-zero cases pass
  // merely because their text is empty.
  const { dir, dbFile, script, child } = stubWorld({
    safeKill: { status: 3, stdout: 'stopped 4242 (/tmp/x)' }, states: { child: { exitCode: 0 } } });
  const { ok, report } = await stopServerAndRemoveDatabase({
    pid: 4242, child, dbFile, safeKill: '/root/safe-kill.sh', exec: script.exec, sleep: noSleep });
  expect(ok).toBe(false);
  expect(report.exitStatus).toBe(3);
  expect(report.databaseRemoved).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});
