import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;
	const text = fs.readFileSync(filePath, 'utf8');
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

loadEnvFile(path.resolve(process.cwd(), '.env'));

export const CONFIG = {
	HOST:      process.env.SERVER_HOST ?? '0.0.0.0',
	PORT:      parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8443', 10),
	CERT_PATH: process.env.CERT_PATH ?? 'dev-certs/cert.pem',
	KEY_PATH:  process.env.KEY_PATH  ?? 'dev-certs/key.pem',
	NODE_ENV:  process.env.NODE_ENV  ?? 'development',
	DISCONNECT_GRACE_MS: 2 * 60 * 1000,
};
