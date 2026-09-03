import { createReconnectingClient } from 'network/transport.js';

function buildUrl() {
	const host = import.meta.env.VITE_WS_HOST;
	const port = import.meta.env.VITE_WS_PORT;
	// Match the page: an https page can only open wss, an http page only ws.
	const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
	if (host && port) return `${scheme}://${host}:${port}/ws`;
	if (host) return `${scheme}://${host}/ws`;
	if (port) return `${scheme}://${window.location.hostname}:${port}/ws`;
	return `${scheme}://${window.location.host}/ws`;
}

export function createClient({ onOpen, onMessage, onClose, onError } = {}) {
	return createReconnectingClient({
		url: buildUrl(),
		protocol: true,
		onOpen,
		onMessage,
		onClose,
		onError,
	});
}
