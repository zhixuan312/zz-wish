# One Light

Write a wish, choose one of ten places, pick or draw a candle (5 minutes to 24 hours of real time), light it once, and keep the page in front while it burns. The full requirements live in `yizhan-design-feedback.html`; the original single-file prototype is `index.html` (reference only, not built).

## Run

```sh
npm install
npm run dev          # Fastify on :8787 and Vite on :5173 (proxying /api)
npm run build        # front end into web/dist
npm start            # one process: API, presence socket and web/dist on :8787
```

Environment: `PORT` (default 8787), `DB_FILE` (default `data/one-light.db`). Node 24 or newer runs the TypeScript server directly.

## Tests

- Tier 1: `npm run test:tier1` runs Vitest (`tests/tier1/unit`) and then Playwright (`tests/tier1/e2e`, one flow at desktop and phone size). Playwright uses installed Google Chrome with GPU flags because the WebGL scene is too slow under software rendering.
- Tier 2: none yet.

## Deploy

```sh
docker build -t one-light .
docker run -d -p 8787:8787 -v one-light-data:/data one-light
```

Serve it over HTTPS (wake lock, the `Secure` cookie and `wss://` need it), run exactly one instance per database, and back up `/data/one-light.db` with `VACUUM INTO`. See section 11 of the requirements for host choices.
