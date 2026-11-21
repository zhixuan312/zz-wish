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

// Attribute wire bytes around a place-switch (Snow Roof → Pine Gate) per request, by event time.
//
// CDP's `Network.dataReceived` carries `timestamp` and `encodedDataLength`, so every chunk has a time. That
// makes the split exact: the bytes a request received before the boundary and the bytes it received after
// are separate sums, not a mixture inferred from a total. Dropping the timestamp was the defect in the
// first version of this module; the local protocol types state both fields
// (node_modules/playwright-core/types/protocol.d.ts: dataReceivedPayload.timestamp, encodedDataLength).
//
// `Network.loadingFinished.encodedDataLength` is the authoritative total. Any difference between it and the
// chunks seen is a residual: bytes CDP counted but did not report as chunks. A residual is never split by
// guesswork — if the request's chunks all landed clearly on one side of the boundary the residual follows
// them, otherwise it is unattributed.

/**
 * Track per-request chunk arrivals with their times and cut them at a boundary.
 *
 * @param {object} [options]
 * @param {number} [options.uncertaintyMs] half-width of the boundary's clock uncertainty
 */
export function createByteLedger(options = {}) {
  const uncertainty = options.uncertaintyMs ?? 0;
  const requests = new Map();
  let boundary = null;
  let confirmed = false;
  let unconfirmedReason = null;
  let order = 0;

  const windowOf = () => boundary === null ? null
    : { start: boundary.atEventMs - boundary.uncertaintyMs, end: boundary.atEventMs + boundary.uncertaintyMs };

  return {
    /**
     * A request started. `atMs` is on the CDP event clock. A start inside the uncertainty window is recorded
     * as such; it must never be assumed to be an old request.
     */
    request({ id, url, atMs }) {
      requests.set(id, { id, url, order: order++, startAt: atMs, chunks: [], finishedAt: null,
        authoritativeBytes: null, failedAt: null, failureText: null });
    },

    /**
     * A chunk arrived. `atMs` is CDP's `timestamp` for that chunk; `bytes` is its `encodedDataLength`.
     * Without a time the chunk cannot be placed, so it is refused rather than merged into a side.
     */
    data({ id, atMs, bytes }) {
      const row = requests.get(id);
      if (!row || typeof bytes !== 'number' || bytes < 0) return false;
      if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
      row.chunks.push({ atMs, bytes });
      return true;
    },

    /** The request finished; this total is authoritative for reconciliation, not for phase placement. */
    finished({ id, atMs, encodedBytes }) {
      const row = requests.get(id);
      if (!row) return;
      row.finishedAt = atMs;
      if (typeof encodedBytes === 'number' && encodedBytes >= 0) row.authoritativeBytes = encodedBytes;
    },

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

    /**
     * Feed one raw CDP event, exactly as `cdp.on(...)` delivers it.
     *
     * CDP times are MonotonicTime in seconds; the ledger works in milliseconds. `dataReceived` carries both
     * `timestamp` and `encodedDataLength`, and that pair is what makes the boundary split exact.
     * Unknown methods are ignored so a caller can pass a whole session's stream.
     */
    fromCdp(event) {
      const params = event?.params ?? {};
      const atMs = typeof params.timestamp === 'number' ? params.timestamp * 1000 : undefined;
      switch (event?.method) {
        case 'Network.requestWillBeSent':
          this.request({ id: params.requestId, url: params.request?.url ?? '', atMs });
          return true;
        case 'Network.dataReceived':
          // Only `encodedDataLength` is wire bytes. `dataLength` is the decoded size, which differs for any
          // compressed response, so substituting it would overstate the transfer.
          return this.data({ id: params.requestId, atMs, bytes: params.encodedDataLength });
        case 'Network.loadingFinished':
          this.finished({ id: params.requestId, atMs, encodedBytes: params.encodedDataLength });
          return true;
        case 'Network.loadingFailed':
          this.failed({ id: params.requestId, atMs, reason: params.errorText });
          return true;
        default:
          return false;
      }
    },

    bytesOf(id) {
      const row = requests.get(id);
      if (!row) return 0;
      return row.authoritativeBytes ?? row.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
    },

    /**
     * Sum chunks into phases and reconcile each request against its authoritative total.
     *
     * Phases: `preSwitchSnowDone` (Snow chunks strictly before the window, on a request that is not newly
     * started), `snowContinuedAfterSwitch` (Snow chunks after the window on a request that started before
     * it), `newSnowAfterSwitch` (a Snow request whose start is after the window), `otherPlace`,
     * `unattributed` (chunks inside the window, and residuals that cannot be placed).
     */
    report({ isSnowUri }) {
      const totals = { preSwitchSnowDone: 0, snowContinuedAfterSwitch: 0, newSnowAfterSwitch: 0,
        otherPlace: 0, unattributed: 0 };
      const rows = [];
      const contradictions = [];
      const classify = uri => (isSnowUri ? isSnowUri(uri) : /\/places\/snow-roof\//.test(uri));
      const window = windowOf();

      for (const row of [...requests.values()].sort((a, b) => a.order - b.order)) {
        const snow = classify(row.url);
        const chunkTotal = row.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
        // The authoritative total is the conservation basis: it is what actually crossed the wire. If
        // CDP reports fewer bytes in chunks than it counted at loadingFinished, the difference is a
        // residual with no timestamp. If it reports MORE, the numbers contradict each other and no phase may
        // claim the excess.
        const authoritative = row.authoritativeBytes;
        const conservative = authoritative ?? chunkTotal;
        // No finish means no authoritative total, so no residual is knowable.
        const residual = authoritative === null || authoritative === undefined
          ? 0 : Math.max(0, authoritative - chunkTotal);
        const notes = [];

        if (authoritative !== null && authoritative !== undefined && chunkTotal > authoritative) {
          notes.push(`chunk total ${chunkTotal} exceeds the authoritative ${authoritative}; the numbers contradict`);
          contradictions.push({ id: row.id, url: row.url, chunkTotal, authoritative });
          rows.push({ id: row.id, url: row.url, phase: 'contradiction', bytes: authoritative, snow,
            preSwitchBytes: 0, afterSwitchBytes: 0, insideWindowBytes: 0, residual: 0,
            startAt: row.startAt, finishedAt: row.finishedAt, failedAt: row.failedAt,
            failureText: row.failureText, note: notes.join('; ') });
          // Nothing from this request is placed; the authoritative total is quarantined.
          totals.unattributed += authoritative;
          continue;
        }

        if (!confirmed) {
          rows.push({ id: row.id, url: row.url, phase: 'unattributed', bytes: conservative, snow,
            preSwitchBytes: 0, afterSwitchBytes: 0, insideWindowBytes: 0, residual,
            startAt: row.startAt, finishedAt: row.finishedAt, failedAt: row.failedAt,
            failureText: row.failureText, note: unconfirmedReason });
          totals.unattributed += conservative;
          continue;
        }

        // Place the observed chunks by their own times.
        let pre = 0, post = 0, inside = 0;
        for (const chunk of row.chunks) {
          if (chunk.atMs < window.start) pre += chunk.bytes;
          else if (chunk.atMs > window.end) post += chunk.bytes;
          else inside += chunk.bytes;
        }
        const insideSeen = inside;

        // The request's whole lifetime decides whether an unobserved residual can be placed at all. A start
        // or a finish inside the window, or one on each side of it, means the bytes could have arrived at any
        // time, so the residual cannot follow the chunks.
        const startedInside = row.startAt >= window.start && row.startAt <= window.end;
        const startedAfter = row.startAt > window.end;
        const finishedBefore = row.finishedAt !== null && row.finishedAt <= window.start;
        const finishedAfter = row.finishedAt !== null && row.finishedAt > window.end;
        const finishedInside = row.finishedAt !== null && row.finishedAt >= window.start
          && row.finishedAt <= window.end;
        const lifetimeWhollyBefore = row.startAt < window.start && finishedBefore;
        const lifetimeWhollyAfter = startedAfter && finishedAfter;

        if (startedInside) notes.push('start lies inside the boundary window; not assumed to be an old request');
        if (finishedInside) notes.push('finish lies inside the boundary window; the residual cannot be placed');

        // A residual is only placeable when the request provably lived entirely on one side.
        let preResidual = 0, postResidual = 0, unplacedResidual = 0;
        if (residual > 0) {
          if (lifetimeWhollyBefore) preResidual = residual;
          else if (lifetimeWhollyAfter) postResidual = residual;
          else {
            unplacedResidual = residual;
            notes.push('the residual has no timestamp and the request crosses the boundary; it is unattributed');
          }
        }

        let phase;
        if (!snow) {
          phase = 'otherPlace';
        } else if (startedAfter) {
          phase = 'newSnowAfterSwitch';
          if (pre > 0) { notes.push('a request that started after the boundary reported earlier chunks'); inside += pre; pre = 0; }
        } else if (startedInside) {
          phase = 'unattributed';
        } else if (finishedBefore && post === 0 && inside === 0) {
          phase = 'preSwitchSnowDone';
        } else if (post > 0 || finishedAfter) {
          phase = 'snowContinuedAfterSwitch';
        } else {
          phase = 'preSwitchSnowDone';
        }

        // A start inside the window means ownership cannot be asserted; everything it received is unassigned.
        if (startedInside) {
          totals.unattributed += pre + post + inside + residual;
          rows.push({ id: row.id, url: row.url, phase: 'unattributed', bytes: conservative, snow,
            preSwitchBytes: 0, afterSwitchBytes: 0, insideWindowBytes: insideSeen, residual,
            startAt: row.startAt, finishedAt: row.finishedAt, failedAt: row.failedAt,
            failureText: row.failureText, note: notes.join('; ') || null });
          continue;
        }

        if (inside > 0) {
          totals.unattributed += inside;
          notes.push('some chunks arrived inside the boundary window');
        }
        if (unplacedResidual > 0) totals.unattributed += unplacedResidual;

        if (phase === 'otherPlace') totals.otherPlace += pre + post + preResidual + postResidual;
        else if (phase === 'newSnowAfterSwitch') totals.newSnowAfterSwitch += pre + post + postResidual;
        else if (phase === 'preSwitchSnowDone') {
          totals.preSwitchSnowDone += pre + preResidual;
          if (post > 0) totals.snowContinuedAfterSwitch += post;
        } else if (phase === 'snowContinuedAfterSwitch') {
          totals.snowContinuedAfterSwitch += post + postResidual;
          if (pre > 0) totals.preSwitchSnowDone += pre;
        } else {
          // Unattributed phases accumulate their own chunks through the branches above.
          if (pre + post > 0) totals.unattributed += pre + post;
        }

        rows.push({ id: row.id, url: row.url, phase, bytes: conservative, snow,
          preSwitchBytes: pre, afterSwitchBytes: post, insideWindowBytes: insideSeen, residual,
          startAt: row.startAt, finishedAt: row.finishedAt, failedAt: row.failedAt,
          failureText: row.failureText, note: notes.length ? notes.join('; ') : null });
      }

      // Conservation is against each request's authoritative total, never against a sum of phases that could
      // double a residual.
      const delivered = [...requests.values()].reduce((accumulator, row) =>
        accumulator + (row.authoritativeBytes ?? row.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)), 0);
      const all = Object.values(totals).reduce((accumulator, value) => accumulator + value, 0);
      totals.all = all;
      return { confirmed, unconfirmedReason, boundary, uncertaintyMs: boundary?.uncertaintyMs ?? uncertainty,
        totals, rows, delivered, contradictions, reconciled: all === delivered };
    },
  };
}
