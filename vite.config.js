import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const serverPort = env.SERVER_PORT ?? '8443';
	// 0.0.0.0 is a bind address, not a connect target — fall back to localhost.
	const proxyHost = env.SERVER_HOST && env.SERVER_HOST !== '0.0.0.0' ? env.SERVER_HOST : 'localhost';
	return {
		resolve: {
			alias: {
				network: path.resolve(__dirname, 'network'),
			},
		},
		server: {
			host: env.VITE_HOST ?? '0.0.0.0',
			https: httpsConfig(),
			proxy: {
				'/ws': {
					target: `wss://${proxyHost}:${serverPort}`,
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
	};
});
