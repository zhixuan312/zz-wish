# Switch byte accounting

`switch-byte-accounting.mjs` splits wire bytes around a place switch (Snow Roof → Pine Gate) per request.
The existing collectors report one cumulative number at each mark, which cannot separate "already received
before the switch" from "arrived after it on a request already in flight" from "started only after the
switch". Those are different costs and are reported separately.

## Entry point

```js
import { createByteLedger } from './switch-byte-accounting.mjs';

const ledger = createByteLedger({ uncertaintyMs: 8 });

// Straight from the CDP events the canonical harness already listens for. Every timestamp is CDP's
// `event.timestamp`, on one clock.
cdp.on('Network.requestWillBeSent', e => ledger.request({ id: e.requestId, url: e.request.url,
  atMs: e.timestamp * 1000 }));
cdp.on('Network.dataReceived', e => ledger.data({ id: e.requestId, bytes: e.dataLength }));
cdp.on('Network.loadingFinished', e => ledger.finished({ id: e.requestId, atMs: e.timestamp * 1000,
  encodedBytes: e.encodedDataLength }));
cdp.on('Network.loadingFailed', e => ledger.failed({ id: e.requestId, atMs: e.timestamp * 1000,
  reason: e.errorText }));

// The boundary, from the DOM after the click, never from the click's promise.
const checked = await page.evaluate(() => [...document.querySelectorAll('[role=radio].place')]
  .filter(node => node.getAttribute('aria-checked') === 'true')
  .map(node => (node.getAttribute('aria-label') ?? '').trim()));
if (checked.length === 1 && checked[0].startsWith('Pine Gate')) {
  // performance.now() in the page must be mapped onto the CDP clock; the difference is `uncertaintyMs`.
  ledger.switchConfirmed({ atEventMs: boundaryOnEventClock, uncertaintyMs: Math.abs(navSkew) });
} else {
  ledger.switchUnconfirmed(`checked place was ${JSON.stringify(checked)}`);
}

const { totals, rows, confirmed } = ledger.report({ isSnowUri: uri => uri.includes('/places/snow-roof/') });
```

## Field example

The case from the review, which the tests assert exactly: one Snow request receives 30 B clearly before
the boundary, 10 B inside the boundary's uncertainty window, and 50 B clearly after, then finishes with an
authoritative 100 B.

```
chunks seen            30 + 10 + 50 = 90
authoritative total    100   → residual 10, and the chunks straddle the window, so the residual is
                             not placeable
totals.preSwitchSnowDone            30
totals.snowContinuedAfterSwitch     50
totals.unattributed                 20   10 inside the window + 10 residual
totals.all                         100
reconciled                        true
```

Its row:

```json
{ "id": "r", "url": "/places/snow-roof/snow-roof.glb.zstd", "phase": "snowContinuedAfterSwitch",
  "bytes": 100, "snow": true, "preSwitchBytes": 30, "afterSwitchBytes": 50,
  "insideWindowBytes": 10, "residual": 10, "startAt": 100, "finishedAt": 1600,
  "failedAt": null, "failureText": null,
  "note": "the authoritative total exceeds the reported chunks and cannot be placed; some chunks arrived inside the boundary window" }
```

## Rules the tests pin

| situation | outcome |
|---|---|
| a chunk whose `timestamp` is before the window | counted in `preSwitchSnowDone` |
| a chunk whose `timestamp` is after the window | counted in `snowContinuedAfterSwitch` |
| a chunk whose `timestamp` is inside the window | counted in `unattributed`, and shown on the row as `insideWindowBytes` |
| request start inside the window | whole request `unattributed`; never assumed to be an old request |
| request started after the window | `newSnowAfterSwitch` |
| residual (authoritative total minus chunks) with chunks wholly on one side | follows that side |
| residual with chunks on both sides | `unattributed`, note "cannot be placed" |
| cancelled request | keeps each side's chunks, `failureText` recorded |
| request never finished | keeps its chunks on each side |
| click never confirmed a checked place | every byte `unattributed`, `confirmed: false`, reason recorded |
| chunk without a usable timestamp | refused, not placed |
| duplicate `loadingFinished` | the row is not doubled |

Bytes are read from one running total per request, never summed from both event streams. A duplicate
`loadingFinished` cannot double a row.

## Limit

There is none of the kind the first version documented. CDP's `dataReceivedPayload` carries both
`timestamp: MonotonicTime` and `encodedDataLength`
(node_modules/playwright-core/types/protocol.d.ts, around line 12078), so a straddling request is split by
its own chunk times rather than inferred from a total. What remains genuinely unknown is the **residual**:
bytes CDP counted at `loadingFinished` but never reported as chunks. There is no timestamp for those, so
they follow their request only when every chunk lies on one side of the window, and are otherwise left
`unattributed`.
