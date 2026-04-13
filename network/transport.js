import { encode, decode, ProtocolError } from './protocol.js';

export function wrapSocket(socket, { onMessage, onClose, onError } = {}) {
	socket.addEventListener('message', event => {
		const data = typeof event.data === 'string' ? event.data : event.data.toString();
		try {
			const msg = decode(data);
			onMessage?.(msg);
		} catch (err) {
			if (err instanceof ProtocolError) onError?.(err);
			else throw err;
		}
	});
	socket.addEventListener('close', event => onClose?.(event));
	socket.addEventListener('error', event => onError?.(event));
	return {
		send(msg) { socket.send(encode(msg)); },
		close(code, reason) { socket.close(code, reason); },
		get readyState() { return socket.readyState; },
	};
}

const BACKOFFS_MS = [500, 1000, 2000, 4000, 8000, 15000];

export function createReconnectingClient({ url, onOpen, onMessage, onClose, onError } = {}) {
	let socket = null;
	let wrapped = null;
	let attempt = 0;
	let closedByUser = false;

	function nextDelay() {
		return BACKOFFS_MS[Math.min(attempt, BACKOFFS_MS.length - 1)];
	}

	function connect() {
		socket = new WebSocket(url);
		wrapped = wrapSocket(socket, {
			onMessage,
			onClose: event => {
				onClose?.(event);
				if (!closedByUser) scheduleReconnect();
			},
			onError,
		});
		socket.addEventListener('open', () => {
			attempt = 0;
			onOpen?.(wrapped);
		});
	}

	function scheduleReconnect() {
		const delay = nextDelay();
		attempt += 1;
		setTimeout(connect, delay);
	}

	connect();

	return {
		send(msg) { wrapped?.send(msg); },
		close() {
			closedByUser = true;
			socket?.close();
		},
		get readyState() {
			return socket?.readyState ?? WebSocket.CLOSED;
		},
	};
}
