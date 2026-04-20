import { describe, test, expect } from 'vitest';
import { WebSocketTransport } from '../network/gameTransport.js';
import { encode } from '../network/protocol.js';

function makeFakeSocket() {
	const listeners = { message: [], close: [], error: [], open: [] };
	return {
		sent: [],
		readyState: 1,
		addEventListener(type, fn) { listeners[type].push(fn); },
		removeEventListener(type, fn) {
			listeners[type] = listeners[type].filter(f => f !== fn);
		},
		send(data) { this.sent.push(data); },
		close(code, reason) {
			this.readyState = 3;
			for (const fn of listeners.close) fn({ code, reason });
		},
		emit(type, event) { for (const fn of listeners[type]) fn(event); },
	};
}

describe('WebSocketTransport', () => {
	test('send() delegates to the wrapped socket with encoding', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		transport.send({ type: 'ping' });
		expect(sock.sent).toHaveLength(1);
		expect(JSON.parse(sock.sent[0])).toEqual({ type: 'ping' });
	});

	test('onMessage handler receives decoded message objects', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		const received = [];
		transport.onMessage(msg => received.push(msg));
		sock.emit('message', { data: JSON.stringify({ type: 'welcome', name: 'x' }) });
		expect(received).toEqual([{ type: 'welcome', name: 'x' }]);
	});

	test('onMessage handler can be registered after construction', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		const received = [];
		// Register handler after construction — message arrives later
		transport.onMessage(msg => received.push(msg));
		sock.emit('message', { data: JSON.stringify({ type: 'go' }) });
		expect(received).toEqual([{ type: 'go' }]);
	});

	test('onClose handler fires when the socket closes', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		let closed = false;
		transport.onClose(() => { closed = true; });
		sock.emit('close', { code: 1000 });
		expect(closed).toBe(true);
	});

	test('onClose handler receives the close event', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		let got = null;
		transport.onClose(event => { got = event; });
		sock.emit('close', { code: 1006 });
		expect(got).toEqual({ code: 1006 });
	});

	test('close() delegates to the wrapped socket', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		transport.close();
		expect(sock.readyState).toBe(3);
	});

	test('messages arriving before onMessage is set are silently dropped', () => {
		const sock = makeFakeSocket();
		const transport = new WebSocketTransport(sock);
		// No handler registered yet — should not throw
		sock.emit('message', { data: JSON.stringify({ type: 'early' }) });
		const received = [];
		transport.onMessage(msg => received.push(msg));
		// Only messages after registration are received
		sock.emit('message', { data: JSON.stringify({ type: 'late' }) });
		expect(received).toEqual([{ type: 'late' }]);
	});
});
