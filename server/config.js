export const CONFIG = {
	PORT:      parseInt(process.env.PORT ?? '8443', 10),
	CERT_PATH: process.env.CERT_PATH ?? 'dev-certs/cert.pem',
	KEY_PATH:  process.env.KEY_PATH  ?? 'dev-certs/key.pem',
	NODE_ENV:  process.env.NODE_ENV  ?? 'development',
	DISCONNECT_GRACE_MS: 2 * 60 * 1000,
};
