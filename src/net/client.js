import { createReconnectingClient } from 'network/transport.js';

export function createClient({ onOpen, onMessage, onClose, onError } = {}) {
	const url = `wss://${window.location.host}/ws`;
	return createReconnectingClient({ url, onOpen, onMessage, onClose, onError });
}
