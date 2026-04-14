import { createReconnectingClient } from 'network/transport.js';

function buildUrl() {
	const host = import.meta.env.VITE_WS_HOST;
	const port = import.meta.env.VITE_WS_PORT;
	if (host && port) return `wss://${host}:${port}/ws`;
	if (host) return `wss://${host}/ws`;
	if (port) return `wss://${window.location.hostname}:${port}/ws`;
	return `wss://${window.location.host}/ws`;
}

export function createClient({ onOpen, onMessage, onClose, onError } = {}) {
	return createReconnectingClient({ url: buildUrl(), onOpen, onMessage, onClose, onError });
}
