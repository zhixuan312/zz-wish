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

From `switch-byte-accounting.test.mjs` ("the phases always add back to what the requests delivered"), one
Snow model finished before the boundary, one lightmap straddled it, Pine Gate started after it, and a small
Snow map started after it:

```
totals.preSwitchSnowDone            300    the Snow model, finished at 120 < boundary 300
totals.snowContinuedAfterSwitch     100    the hall map: started 130, finished 420
totals.newSnowAfterSwitch            20    altar-day, started 450 > boundary 300
totals.otherPlace                  700    pine-gate.glb
totals.unattributed                  0
totals.all                       1 120    = 300 + 100 + 700 + 20
```

A row from the same report:

```json
{ "id": "b", "url": "/places/snow-roof/hall-day.ktx2", "phase": "snowContinuedAfterSwitch",
  "bytes": 100, "snow": true, "startAt": 130, "finishedAt": 420, "failedAt": null,
  "failureText": null, "note": null }
```

## Rules the tests pin

| situation | outcome |
|---|---|
| request finished before the boundary window | `preSwitchSnowDone` |
| request started before and finished after the window | `snowContinuedAfterSwitch` — a mixture, labelled |
| request started after the window | `newSnowAfterSwitch` |
| request finished **inside** the window | `unattributed`, note "finished inside the boundary window" |
| request cancelled after the boundary | keeps its delivered bytes, phase `snowContinuedAfterSwitch`, `failureText` recorded |
| request never finished | keeps its bytes, note "request was still in flight at the report" |
| click never confirmed a checked place | every byte `unattributed`, `confirmed: false`, reason recorded |
| `loadingFinished` after `dataReceived` | the encoded length replaces the accumulation; never added to it |

Bytes are read from one running total per request, never summed from both event streams. A duplicate
`loadingFinished` cannot double a row.

## Limit

Without per-chunk timestamps, a request that straddles the boundary cannot be split by byte: CDP reports
`dataReceived` counts without times, and `loadingFinished` gives only the total. Its bytes are therefore
reported as one mixture under `snowContinuedAfterSwitch`, and a request finishing inside the uncertainty
window is moved to `unattributed` rather than guessed. Splitting it would need `Network.dataReceived`
timestamps ordered against the boundary, which this CDP session does not expose.
