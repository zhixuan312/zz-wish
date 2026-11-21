// Attribute wire bytes around a place-switch (Snow Roof → Pine Gate) per request.
//
// The existing collectors report one cumulative number at each mark. That cannot answer the question this
// module exists for: how much Snow Roof traffic had already arrived before the visitor chose Pine Gate, how
// much of that arrived afterwards on requests already in flight, and how much Snow Roof traffic started only
// after the switch. Those three are different costs and must not be summed.
//
// Boundary. The switch is the moment the place selection actually took effect, verified by reading the
// checked radio after the click. If the click failed, or no radio reports checked, the boundary is
// unconfirmed and every byte is left unattributed rather than assigned to a guessed side.
//
// Two clocks. The boundary is observed with `performance.now()` in the page; request events carry CDP
// timestamps. The caller passes both plus a measured uncertainty window (milliseconds). A request whose
// transfer straddles the window cannot be split with confidence, so its bytes inside the window are
// counted as unattributed and only the part clearly outside the window is attributed.
//
// No double counting. `dataReceived` accumulates a running total per request; `loadingFinished` replaces it
// with the authoritative encoded length. A request that never finishes keeps the accumulated value and is
// reported as partial. Bytes are only ever read from one running total per request, never summed from both
// event streams.

/**
 * Track per-request byte progress and cut it at a boundary.
 *
 * @param {object} [options]
 * @param {number} [options.uncertaintyMs] how far the boundary clock can be from the event clock
 */
export function createByteLedger(options = {}) {
  const uncertainty = options.uncertaintyMs ?? 0;
  const requests = new Map();
  let boundary = null;          // { atEventMs, uncertaintyMs }
  let confirmed = false;        // the switch was verified from the DOM
  let unconfirmedReason = null;
  let order = 0;

  return {
    /** A request started. `atMs` is on the event clock. */
    request({ id, url, atMs }) {
      requests.set(id, { id, url, order: order++, startAt: atMs, received: 0, finishedAt: null,
        failedAt: null, failureText: null, authoritativeBytes: null });
    },

    /** Some bytes arrived. Accumulates; never added to a finished total. */
    data({ id, bytes }) {
      const row = requests.get(id);
      if (!row || typeof bytes !== 'number' || bytes < 0) return;
      row.received += bytes;
    },

    /** The request finished; its encoded length is authoritative and replaces the accumulation. */
    finished({ id, atMs, encodedBytes }) {
      const row = requests.get(id);
      if (!row) return;
      row.finishedAt = atMs;
      row.authoritativeBytes = typeof encodedBytes === 'number' ? encodedBytes : row.received;
    },

    /** The request failed or was cancelled. Bytes already received stay counted. */
    failed({ id, atMs, reason }) {
      const row = requests.get(id);
      if (!row) return;
      row.failedAt = atMs;
      row.failureText = String(reason ?? 'failed');
    },

    /** The visitor's selection was verified from the checked radio. */
    switchConfirmed({ atEventMs, uncertaintyMs }) {
      boundary = { atEventMs, uncertaintyMs: uncertaintyMs ?? uncertainty };
      confirmed = true;
      unconfirmedReason = null;
    },

    /** The selection could not be verified; nothing may be attributed to either side. */
    switchUnconfirmed(reason) {
      boundary = null;
      confirmed = false;
      unconfirmedReason = String(reason ?? 'the place selection was not confirmed');
    },

    /** Total bytes a request has delivered so far (authoritative once finished). */
    bytesOf(id) {
      const row = requests.get(id);
      if (!row) return 0;
      return row.authoritativeBytes ?? row.received;
    },

    /**
     * Attribute every request's bytes to a phase and return the totals plus the rows.
     *
     * Phase names: `preSwitchSnowDone` (Snow bytes that arrived and finished before the boundary),
     * `snowContinuedAfterSwitch` (bytes that arrived after the boundary on a request that started before
     * it), `newSnowAfterSwitch` (bytes of a Snow request that started after the boundary),
     * `otherPlace` (not Snow Roof: cloud cliff, pine gate, materials), `unattributed`.
     */
    report({ isSnowUri }) {
      const totals = { preSwitchSnowDone: 0, snowContinuedAfterSwitch: 0, newSnowAfterSwitch: 0,
        otherPlace: 0, unattributed: 0 };
      const rows = [];
      const classify = uri => (isSnowUri ? isSnowUri(uri) : /\/places\/snow-roof\//.test(uri));

      for (const row of [...requests.values()].sort((a, b) => a.order - b.order)) {
        const total = row.authoritativeBytes ?? row.received;
        const snow = classify(row.url);
        let phase;
        let attributed;
        let note = null;

        if (!confirmed) {
          // An unverified boundary cannot justify any split, but the bytes still landed and must appear in
          // the total, so they are counted as unattributed rather than discarded.
          phase = 'unattributed';
          attributed = total;
          note = unconfirmedReason;
        } else if (!snow) {
          phase = 'otherPlace';
          attributed = total;
        } else {
          const windowStart = boundary.atEventMs - boundary.uncertaintyMs;
          const windowEnd = boundary.atEventMs + boundary.uncertaintyMs;
          const startedBefore = row.startAt < windowStart;
          const startedAfter = row.startAt > windowEnd;

          if (startedAfter) {
            phase = 'newSnowAfterSwitch';
            attributed = total;
            // Subtract what arrived inside the boundary window, if the request overlapped it.
          } else if (startedBefore && row.finishedAt !== null && row.finishedAt <= windowStart) {
            phase = 'preSwitchSnowDone';
            attributed = total;
          } else {
            // Started before the boundary and may have continued past it. Only a request that finished
            // before the window is unambiguously complete. Without per-chunk timestamps this module cannot
            // know how many of its bytes arrived before the boundary, so a request that finished after the
            // window is reported as continued and its count is explicitly a mixture.
            phase = 'snowContinuedAfterSwitch';
            attributed = total;
            if (row.finishedAt === null) note = 'request was still in flight at the report';
            else if (row.finishedAt < windowEnd) note = 'finished inside the boundary window; the split is uncertain';
          }
        }

        totals[phase] += attributed;
        rows.push({ id: row.id, url: row.url, phase, bytes: total, snow, startAt: row.startAt,
          finishedAt: row.finishedAt, failedAt: row.failedAt, failureText: row.failureText, note });
      }

      // Bytes that cannot be placed because a request straddles the window are counted as unattributed and
      // removed from its phase, so the phases never claim a precision the evidence does not support.
      for (const row of rows) {
        if (row.phase === 'snowContinuedAfterSwitch' && row.note
          && /inside the boundary window/.test(row.note)) {
          totals[row.phase] -= row.bytes;
          totals.unattributed += row.bytes;
          row.phase = 'unattributed';
        }
      }

      totals.all = Object.values(totals).reduce((sum, value) => sum + value, 0);
      return { confirmed, unconfirmedReason, boundary, uncertaintyMs: boundary?.uncertaintyMs ?? uncertainty,
        totals, rows };
    },
  };
}
