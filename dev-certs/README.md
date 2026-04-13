# Dev certs

This project uses `wss://` locally. Generate a locally-trusted cert via `mkcert`:

```bash
mkcert -install
mkcert -key-file dev-certs/key.pem -cert-file dev-certs/cert.pem localhost 127.0.0.1 ::1
```

`mkcert -install` installs a local root CA once per machine. The generated `.pem` files are gitignored; do not commit them.

The Node server refuses to start if these files are missing. Vite falls back to HTTP with a warning if they are missing during `npm run dev`.
