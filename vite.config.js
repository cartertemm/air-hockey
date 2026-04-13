import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const CERT = 'dev-certs/cert.pem';
const KEY  = 'dev-certs/key.pem';

function httpsConfig() {
	if (fs.existsSync(CERT) && fs.existsSync(KEY)) {
		return { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) };
	}
	console.warn('[vite] dev-certs not found; falling back to HTTP. See dev-certs/README.md.');
	return false;
}

export default defineConfig({
	resolve: {
		alias: {
			network: path.resolve(__dirname, 'network'),
		},
	},
	server: {
		https: httpsConfig(),
		proxy: {
			'/ws': {
				target: 'wss://localhost:8443',
				ws: true,
				changeOrigin: true,
				secure: false,
			},
		},
	},
	test: {
		environment: 'happy-dom',
		setupFiles: ['./tests/setup.js'],
		globals: false,
	},
});
