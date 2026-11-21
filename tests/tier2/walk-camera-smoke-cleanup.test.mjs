// Offline checks for the smoke harness's cleanup and failure propagation.
//
// The harness cannot be run here: it needs a build, a browser and a lease. What can be pinned is the
// contract its finally block must obey, exercised against a stub that stands in for the server and for
// safe-kill.sh. Each case drives the same decision the harness makes and asserts the resulting exit code
// and whether the run's own database survived.
import { expect, test } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The decision the harness makes after safe-kill returns, extracted so a stub can drive it without a
// browser. It mirrors walk-camera-smoke.mjs's finally block:
//   - safe-kill is the only stop path; its refusal keeps the database and fails the run
//   - the database is removed only after the process is confirmed gone
//   - a run with no usable measurement fails even without an exception
function finishRun({ pid, dbFile, safeKillOutput, gone, verdict }) {
  const refused = /refused/i.test(safeKillOutput);
  const killReport = { pid, attempted: true, output: safeKillOutput, stopped: !refused };
  killReport.confirmedGone = gone && !refused;
  let failure = false;
  if (killReport.confirmedGone) {
    rmSync(dbFile, { force: true });
    killReport.databaseRemoved = true;
  } else {
    killReport.databaseRemoved = false;
    killReport.retainedDatabase = dbFile;
    failure = true;
  }
  const usable = verdict === 'moving' || verdict === 'rotating' || verdict === 'still';
  if (!usable) failure = true;
  return { killReport, exitCode: failure ? 1 : 0 };
}

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-stub-'));
  const dbFile = join(dir, 'smoke.db');
  writeFileSync(dbFile, 'sqlite');
  return { dir, dbFile };
}

test('a stopped process lets the run remove its own database and exit zero', () => {
  const { dbFile, dir } = workspace();
  const outcome = finishRun({ pid: 4242, dbFile, safeKillOutput: 'stopped 4242 (/tmp/x)', gone: true,
    verdict: 'moving' });
  expect(outcome.exitCode).toBe(0);
  expect(outcome.killReport.stopped).toBe(true);
  expect(outcome.killReport.databaseRemoved).toBe(true);
  expect(existsSync(dbFile)).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test('a safe-kill refusal keeps the database and exits non-zero', () => {
  const { dbFile, dir } = workspace();
  const outcome = finishRun({ pid: 4242, dbFile,
    safeKillOutput: 'refused 4242: cwd is not yours', gone: false, verdict: 'moving' });
  expect(outcome.exitCode).toBe(1);
  expect(outcome.killReport.stopped).toBe(false);
  expect(outcome.killReport.databaseRemoved).toBe(false);
  expect(outcome.killReport.retainedDatabase).toBe(dbFile);
  // The database is still there for inspection: never cleaned on a refusal.
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a process that survives safe-kill is treated as a refusal, not as success', () => {
  const { dbFile, dir } = workspace();
  const outcome = finishRun({ pid: 4242, dbFile, safeKillOutput: 'stopped 4242 (/tmp/x)', gone: false,
    verdict: 'moving' });
  expect(outcome.exitCode).toBe(1);
  expect(outcome.killReport.databaseRemoved).toBe(false);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a run with no usable verdict fails even when nothing threw', () => {
  const { dbFile, dir } = workspace();
  for (const verdict of ['unknown', undefined, null]) {
    writeFileSync(dbFile, 'sqlite');
    const outcome = finishRun({ pid: 4242, dbFile, safeKillOutput: 'stopped 4242', gone: true, verdict });
    expect(outcome.exitCode, String(verdict)).toBe(1);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('a rotating or still verdict counts as usable, and only moving crosses no threshold', () => {
  const { dbFile, dir } = workspace();
  for (const verdict of ['moving', 'rotating', 'still']) {
    writeFileSync(dbFile, 'sqlite');
    const outcome = finishRun({ pid: 4242, dbFile, safeKillOutput: 'stopped 4242', gone: true, verdict });
    expect(outcome.exitCode, verdict).toBe(0);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('safe-kill refuses a process outside the authorised tree, and the harness would see that text', () => {
  // Use the real script against this test process: it is not in a worker worktree, so it must refuse.
  let output;
  try {
    output = execFileSync('/Users/xuan/OpenBot/Shared/one-light/safe-kill.sh',
      ['s2', String(process.pid)], { encoding: 'utf8' });
  } catch (error) {
    output = String(error?.stdout ?? '');
  }
  expect(output).toMatch(/refused/);
  // And the harness's own decision on that text keeps the database and fails.
  const { dbFile, dir } = workspace();
  const outcome = finishRun({ pid: process.pid, dbFile, safeKillOutput: output, gone: true, verdict: 'moving' });
  expect(outcome.exitCode).toBe(1);
  expect(existsSync(dbFile)).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('a stub server started and stopped through the real safe-kill contract exits cleanly', async () => {
  // A short-lived process whose cwd is the authorised tmp, so safe-kill permits stopping it.
  const runDir = '/Users/xuan/OpenBot/Shared/one-light/tmp/s2';
  const stub = spawn('sh', ['-c', 'sleep 30'], { cwd: runDir, stdio: 'ignore' });
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    const output = execFileSync('/Users/xuan/OpenBot/Shared/one-light/safe-kill.sh',
      ['s2', String(stub.pid)], { encoding: 'utf8' }).trim();
    expect(output).toMatch(/stopped|gone/);
    const { dbFile, dir } = workspace();
    const outcome = finishRun({ pid: stub.pid, dbFile, safeKillOutput: output, gone: true, verdict: 'moving' });
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(dbFile)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  } finally {
    // The stub may already be gone; if not, the same sanctioned path stops it.
    try {
      execFileSync('/Users/xuan/OpenBot/Shared/one-light/safe-kill.sh', ['s2', String(stub.pid)],
        { encoding: 'utf8' });
    } catch { /* already stopped */ }
  }
});
