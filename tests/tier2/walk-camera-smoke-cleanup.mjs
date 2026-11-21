import { lstatSync } from 'node:fs';

// Cleanup contract for a run that starts its own server.
//
// This is the single implementation the smoke harness calls from its `finally`, and the same function the
// tests drive with stubbed dependencies. Keeping it here is the point: a test that re-implements the
// decision cannot catch a regression in the real one.
//
// Rules, all from GOALS.md and the cleanup reviews:
//   - the only stop path is safe-kill.sh with the PID recorded at startup
//   - a refusal, a safe-kill launch failure, any other non-zero status (even with no text), or an
//     unreadable process state all mean "not authorised to delete"
//   - the database is removed only after the process is confirmed gone by a successful status query,
//     and only files this run created are removed
//   - a removal that fails, or a file that survives, means the run did not clean up
//
// The database lives in a directory unique to the run, so nothing here can delete another run's files.

/**
 * The process state of a ChildProcess, read from its own record rather than from `ps`.
 *
 * A shell wrapper that swallows `ps` errors turns every failed query into "gone", which is the one answer
 * that must never be guessed. A ChildProcess carries the truth directly: `exitCode` and `signalCode` are
 * set once the child exits, and `killed`/`pid` say whether it ever existed. `unknown` is returned when the
 * handle has no usable information, so a caller can refuse to delete rather than assume absence.
 *
 * @param {import('node:child_process').ChildProcess|null|undefined} child
 * @param {{pid?: number}} [expected] the pid recorded at startup, when the handle is unavailable
 */
export function processState(child, expected) {
  if (child && typeof child === 'object') {
    if (child.exitCode !== null && child.exitCode !== undefined) return { state: 'gone', exitCode: child.exitCode };
    if (child.signalCode !== null && child.signalCode !== undefined) return { state: 'gone', signalCode: child.signalCode };
    if (typeof child.pid === 'number' && child.pid > 0) return { state: 'alive', pid: child.pid };
    return { state: 'unknown', reason: 'the child handle has neither a pid nor an exit' };
  }
  if (expected && typeof expected.pid === 'number') {
    // Without the handle there is nothing authoritative to read; a bare pid cannot distinguish a dead
    // process from one whose status cannot be queried.
    try {
      process.kill(expected.pid, 0);
      return { state: 'alive', pid: expected.pid };
    } catch (error) {
      if (error?.code === 'ESRCH') return { state: 'gone', pid: expected.pid };
      // EPERM and anything else mean the process may exist but cannot be inspected.
      return { state: 'unknown', pid: expected.pid, reason: String(error?.code ?? error?.message ?? error) };
    }
  }
  return { state: 'unknown', reason: 'no child handle and no pid' };
}

/**
 * Stop the run's server through safe-kill, confirm it is gone, then remove this run's own database.
 *
 * @param {object} options
 * @param {number} options.pid recorded when the server was started
 * @param {import('node:child_process').ChildProcess} [options.child] the handle used to read the process
 *   state authoritatively; without it the pid is probed with `process.kill(pid, 0)`
 * @param {string} options.dbFile the database this run created, inside its own directory
 * @param {string} options.safeKill path to safe-kill.sh
 * @param {(file: string, args: string[], opts?: object) => string} options.exec
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {(file: string) => boolean} [options.exists] returns whether a file is present; defaults to a
 *   `test -f` through the same exec, so a removal is verified rather than assumed
 * @param {string[]} [options.suffixes] sidecar suffixes to remove with the database
 * @returns {Promise<{ok: boolean, report: object}>}
 */
export async function stopServerAndRemoveDatabase({ pid, child, dbFile, safeKill, exec, sleep, suffixes,
  exists }) {
  const wait = sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const sidecars = suffixes ?? ['', '-shm', '-wal'];
  // Existence is read with lstat and no shell: only ENOENT means the file is not there. Any other error
  // (a permission problem, an unreadable directory) cannot prove absence, so it counts as present.
  const present = exists ?? (file => {
    try { lstatSync(file); return true; }
    catch (error) { return error?.code !== 'ENOENT'; }
  });
  const report = { pid, attempted: true, output: '', launched: false, refused: false, exitStatus: null,
    processState: null, confirmedGone: false, databaseRemoved: false, filesRemoved: [],
    failedRemovals: [] };

  // 1. Stop through the sanctioned path only.
  try {
    report.output = String(exec(safeKill, ['s2', String(pid)], { encoding: 'utf8' }) ?? '').trim();
    report.launched = true;
    report.exitStatus = 0;
  } catch (error) {
    // safe-kill exits 3 on a refusal. A launch failure has no status, which is also not success.
    report.launched = true;
    report.exitStatus = typeof error?.status === 'number' ? error.status : 'launch-failed';
    report.output = String(error?.stdout ?? '').trim() || String(error?.stderr ?? '').trim()
      || String(error?.message ?? error).slice(0, 200);
  }
  report.refused = /refused/i.test(report.output);
  // Any non-zero status counts as unauthorised, whether or not the text said "refused".
  const stopAuthorised = report.exitStatus === 0 && !report.refused
    && /stopped|gone/i.test(report.output);

  // 2. Confirm the process is gone, from the child handle when there is one. An unknown state is not gone.
  let observed = { state: 'unknown', reason: 'not queried' };
  for (let attempt = 0; attempt < 40; attempt++) {
    observed = processState(child ?? null, { pid });
    if (observed.state === 'gone') break;
    if (observed.state === 'unknown' && attempt > 2) break;
    await wait(100);
  }
  const state = observed.state;
  report.processState = state;
  report.processDetail = observed;
  report.confirmedGone = state === 'gone' && stopAuthorised;

  if (!stopAuthorised) {
    report.reason = report.refused ? 'safe-kill refused this pid'
      : report.exitStatus === 0 ? 'safe-kill returned no stop confirmation'
        : `safe-kill exited ${report.exitStatus}`;
    report.retainedDatabase = dbFile;
    return { ok: false, report };
  }
  if (!report.confirmedGone) {
    report.reason = `process state is ${state}, not gone`;
    report.retainedDatabase = dbFile;
    return { ok: false, report };
  }

  // 3. Remove only files this run created, and verify each is gone. A failed removal, or a file that
  // survives it, means the run did not clean up.
  for (const suffix of sidecars) {
    const file = dbFile + suffix;
    try { exec('rm', ['-f', file]); }
    catch { /* recorded below through the existence check */ }
    if (present(file)) report.failedRemovals.push(file);
    else report.filesRemoved.push(file);
  }
  report.databaseRemoved = report.failedRemovals.length === 0;
  report.ok = report.databaseRemoved;
  if (!report.ok) {
    report.reason = `files survived removal: ${report.failedRemovals.join(', ')}`;
  }
  return { ok: report.ok, report };
}
