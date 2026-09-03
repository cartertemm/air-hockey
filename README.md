# air-hockey

This is an attempt to make an online multiplayer rendition of air hockey that two people can play, either in the same room or remotely, on any device with a browser or internet connection, using a keyboard/mouse/touch screen.

We have placed particular emphasis on physics, so the experience should be exactly what you would get if you were actually standing in front of an air hockey table. This is not a game about chance. If you win, it should be because your reflexes were better, your positioning was better, or you managed to throw the other person off somehow.

## How it Works (tech stuff)

There are two parts:

- a browser client, served by Vite
- a Node WebSocket server that handles the session and game state

In development, the browser talks to the server over `/ws`. Vite proxies that to the local WebSocket server for you unless you point the client somewhere else with env vars.

The server can run in two modes. Plain mode uses `http://` and `ws://` and needs no certificates. Secure mode uses `https://` and `wss://` and needs local certs. Both parts must be in the same mode, because a page loaded over `https://` cannot open a plain `ws://` socket. The client picks its socket scheme from the page it is served on, so you never set it by hand.

## Getting set up

Install dependencies:

```bash
npm install
```

Copy the example env file:

```bash
cp .env.example .env
```

If you are on PowerShell:

```powershell
Copy-Item .env.example .env
```

Start the WebSocket server:

```bash
npm run server
```

In another terminal, start the client:

```bash
npm run dev
```

Then open the Vite URL in a browser, which defaults to `http://localhost:5173`. The dev server already binds to all interfaces, so you do not need `--host`.

## Running in secure mode

Use secure mode when you need `https://`, for example to test features that browsers only allow on a secure origin.

Generate local certs with `mkcert` first:

```bash
mkcert -install
mkcert -key-file dev-certs/key.pem -cert-file dev-certs/cert.pem localhost 127.0.0.1 ::1
```

Then start both parts in secure mode:

```bash
npm run server-secure
```

```bash
npm run dev-secure
```

Now open `https://localhost:5173`.

Rules to remember:

- Run both halves in the same mode. `npm run dev-secure` with `npm run server` fails, and so does the reverse.
- `npm run server-secure` refuses to start if the cert files are missing.
- `npm run dev-secure` warns and falls back to HTTP if the cert files are missing. The client then dials `ws://` while the server speaks `wss://`, so the game cannot connect. Generate the certs.
- `npm run dev-secure` runs Vite in the `secure` mode, so Vite reads `.env.secure` instead of `.env.development`. Plain `.env` is still read in both modes.

## Playing on a local network

Two people on the same network can play without any production server. Everything runs on one machine (the host); the other device just points its browser at the host.

1. Find the host machine's LAN IP (`ipconfig` on Windows, `ifconfig` / `ip addr` elsewhere), for example `192.168.1.50`.
2. Start the server (`npm run server`) and client (`npm run dev`) on the host.
3. On the other device, open `http://<host-ip>:5173` (for example `http://192.168.1.50:5173`).

Only port `5173` needs to be reachable from the other device, so allow it through the host's firewall. The WebSocket server on `8080` only ever talks to the host itself: the browser connects same-origin to `/ws`, and Vite proxies that to `localhost:8080`.

If you use secure mode on a LAN, the second device shows a certificate warning, because the dev certs are signed by a local CA that only the host machine trusts. Accept the warning and continue. To avoid it, install the mkcert root CA (`mkcert -CAROOT`) on the other device too.

## Environment notes

`.env.example` covers the things you are most likely going to want to change at some point.

- `SERVER_HOST` controls what interface the Node server binds to
- `SERVER_PORT` controls the WebSocket server port
- `VITE_WS_HOST` and `VITE_WS_PORT` let the browser connect somewhere else directly instead of using the Vite `/ws` proxy

Secure mode adds two more, both optional:

- `CERT_PATH` and `KEY_PATH` point the Node server at different cert files. They default to `dev-certs/cert.pem` and `dev-certs/key.pem`.

You can also turn on secure mode for the server with `SECURE=true` in the environment, which does the same thing as the `--secure` flag.

The defaults are already set up for local development on port `8080`. Once this receives more testing and could be called stable, we will host a production endpoint.

## Useful scripts

- `npm run dev` starts the Vite dev server over HTTP
- `npm run dev-secure` starts the Vite dev server over HTTPS
- `npm run server` starts the Node WebSocket server over `ws://`
- `npm run server-secure` starts the Node WebSocket server over `wss://`
- `npm run build` builds the client
- `npm run preview` previews the built client
- `npm test` runs the test suite once
- `npm run test:watch` runs Vitest in watch mode

## Notes for developers

Tests use Vitest with `happy-dom`.

If you are touching shared wire formats, look in `network/`. That code is imported by both the client and the server.

If you are working on input behavior or gameplay feel, run the tests, then actually play it. This project lives or dies on "what feels right", not just whether the tests pass.
