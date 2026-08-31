import https from 'node:https';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { createServer } from 'audiogame-utils/net/server';
import { codec } from '../network/transport.js';
import { attachHandlers } from './handshake.js';

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

const game = createServer({ codec });
attachHandlers(game);

const tls = readCertsOrExit();
const server = https.createServer(tls);
const wss = new WebSocketServer({ server });

wss.on('connection', socket => {
	game.accept(socket);
});

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
	console.log(`[server] listening on wss://${CONFIG.HOST}:${CONFIG.PORT}`);
});

function shutdown() {
	console.log('[server] shutting down');
	game.close();
	wss.close();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
