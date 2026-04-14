import https from 'node:https';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { handleConnection } from './handshake.js';
import { reapIdle } from './player.js';

function readCertsOrExit() {
	if (!fs.existsSync(CONFIG.CERT_PATH) || !fs.existsSync(CONFIG.KEY_PATH)) {
		console.error(`Missing TLS cert/key. Run mkcert — see dev-certs/README.md.`);
		process.exit(1);
	}
	return {
		cert: fs.readFileSync(CONFIG.CERT_PATH),
		key:  fs.readFileSync(CONFIG.KEY_PATH),
	};
}

const tls = readCertsOrExit();
const server = https.createServer(tls);
const wss = new WebSocketServer({ server });

wss.on('connection', socket => {
	handleConnection(socket);
});

const REAPER_INTERVAL_MS = 30_000;
const reaperHandle = setInterval(
	() => reapIdle({ graceMs: CONFIG.DISCONNECT_GRACE_MS }),
	REAPER_INTERVAL_MS,
);
reaperHandle.unref?.();

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
	console.log(`[server] listening on wss://${CONFIG.HOST}:${CONFIG.PORT}`);
});

function shutdown() {
	console.log('[server] shutting down');
	clearInterval(reaperHandle);
	wss.close();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
