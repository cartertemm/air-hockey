# air-hockey

This is an attempt to make an online multiplayer rendition of air hockey that two people can play, either in the same room or remotely, on any device with a browser or internet connection, using a keyboard/mouse/touch screen.

We have placed particular emphasis on physics, so the experience should be exactly what you would get if you were actually standing in front of an air hockey table. This is not a game about chance. If you win, it should be because your reflexes were better, your positioning was better, or you managed to throw the other person off somehow.

## How it Works (tech stuff)

There are two parts:

- a browser client, served by Vite
- a Node WebSocket server that handles the session and game state

In development, the browser talks to the server over `/ws`. Vite proxies that to the local WebSocket server for you unless you point the client somewhere else with env vars.

The server always runs over `wss://`, so local certs are required to start it.

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

Generate local certs with `mkcert`:

```bash
mkcert -install
mkcert -key-file dev-certs/key.pem -cert-file dev-certs/cert.pem localhost 127.0.0.1 ::1
```

The WebSocket server expects those cert files to exist. If they do not, `npm run server` will refuse to start. Vite can still come up without them, but it falls back to HTTP and prints a warning, and the client always dials `wss://`, so the game cannot connect over that fallback. In practice you need the certs.

Start the WebSocket server:

```bash
npm run server
```

In another terminal, start the client:

```bash
npm run dev
```

Then open the Vite URL in a browser, which defaults to `https://localhost:5173`. The dev server already binds to all interfaces, so you do not need `--host`.

## Playing on a local network

Two people on the same network can play without any production server. Everything runs on one machine (the host); the other device just points its browser at the host.

1. Find the host machine's LAN IP (`ipconfig` on Windows, `ifconfig` / `ip addr` elsewhere), for example `192.168.1.50`.
2. Start the server (`npm run server`) and client (`npm run dev`) on the host.
3. On the other device, open `https://<host-ip>:5173` (for example `https://192.168.1.50:5173`).

Only port `5173` needs to be reachable from the other device, so allow it through the host's firewall. The WebSocket server on `8443` only ever talks to the host itself: the browser connects same-origin to `/ws`, and Vite proxies that to `localhost:8443`.

The dev certs are signed by a local CA that only the host machine trusts, so the second device will show a certificate warning. That is expected on a LAN: just accept it and continue. If you want to avoid the warning, install the mkcert root CA (`mkcert -CAROOT`) on the other device too.

## Environment notes

`.env.example` covers the things you are most likely going to want to change at some point.

- `SERVER_HOST` controls what interface the Node server binds to
- `SERVER_PORT` controls the WebSocket server port
- `VITE_WS_HOST` and `VITE_WS_PORT` let the browser connect somewhere else directly instead of using the Vite `/ws` proxy

The defaults are already set up for local development on port `8443`. Once this receives more testing and could be called stable, we will host a production endpoint.

## Useful scripts

- `npm run dev` starts the Vite dev server
- `npm run server` starts the Node WebSocket server
- `npm run build` builds the client
- `npm run preview` previews the built client
- `npm test` runs the test suite once
- `npm run test:watch` runs Vitest in watch mode

## Notes for developers

Tests use Vitest with `happy-dom`.

If you are touching shared wire formats, look in `network/`. That code is imported by both the client and the server.

If you are working on input behavior or gameplay feel, run the tests, then actually play it. This project lives or dies on "what feels right", not just whether the tests pass.
