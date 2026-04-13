import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrapSocket, createReconnectingClient } from '../network/transport.js';
import { hello, ProtocolError } from '../network/protocol.js';

// Minimal fake socket with the EventTarget-ish surface used by both
// browser WebSocket and the `ws` library.
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

describe('wrapSocket', () => {
	test('encodes outgoing messages as JSON', () => {
		const sock = makeFakeSocket();
		const wrapped = wrapSocket(sock, {});
		wrapped.send(hello({ name: 'Swift Otter' }));
		expect(sock.sent).toHaveLength(1);
		expect(JSON.parse(sock.sent[0])).toEqual({
			type: 'hello', clientId: undefined, sessionToken: undefined, name: 'Swift Otter',
		});
	});

	test('dispatches decoded messages to onMessage', () => {
		const sock = makeFakeSocket();
		const seen = [];
		wrapSocket(sock, { onMessage: msg => seen.push(msg) });
		sock.emit('message', { data: JSON.stringify({ type: 'welcome', name: 'x' }) });
		expect(seen).toEqual([{ type: 'welcome', name: 'x' }]);
	});

	test('surfaces ProtocolError on malformed input via onError and does NOT close', () => {
		const sock = makeFakeSocket();
		let err = null;
		let closed = false;
		wrapSocket(sock, {
			onMessage: () => {},
			onError: e => { err = e; },
			onClose: () => { closed = true; },
		});
		sock.emit('message', { data: 'not json' });
		expect(err).toBeInstanceOf(ProtocolError);
		expect(closed).toBe(false);
	});

	test('forwards close events to onClose', () => {
		const sock = makeFakeSocket();
		let got = null;
		wrapSocket(sock, { onClose: e => { got = e; } });
		sock.emit('close', { code: 1006 });
		expect(got).toEqual({ code: 1006 });
	});
});

describe('createReconnectingClient', () => {
	let instances;
	let createdUrls;
	let OriginalWebSocket;

	beforeEach(() => {
		instances = [];
		createdUrls = [];
		OriginalWebSocket = globalThis.WebSocket;
		globalThis.WebSocket = class FakeWS {
			constructor(url) {
				createdUrls.push(url);
				this.url = url;
				this.readyState = 0;
				this.listeners = { open: [], message: [], close: [], error: [] };
				instances.push(this);
			}
			addEventListener(type, fn) { this.listeners[type].push(fn); }
			removeEventListener(type, fn) {
				this.listeners[type] = this.listeners[type].filter(f => f !== fn);
			}
			send() {}
			close() {
				this.readyState = 3;
				for (const fn of this.listeners.close) fn({});
			}
			emit(type, event) { for (const fn of this.listeners[type]) fn(event); }
		};
		globalThis.WebSocket.CLOSED = 3;
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		globalThis.WebSocket = OriginalWebSocket;
	});

	test('opens a socket immediately with the given URL', () => {
		createReconnectingClient({ url: 'wss://example/ws' });
		expect(createdUrls).toEqual(['wss://example/ws']);
	});

	test('calls onOpen when the socket opens', () => {
		let opened = false;
		createReconnectingClient({ url: 'wss://example/ws', onOpen: () => { opened = true; } });
		instances[0].emit('open', {});
		expect(opened).toBe(true);
	});

	test('reconnects with exponential backoff after an unexpected close', () => {
		createReconnectingClient({ url: 'wss://example/ws' });
		// First socket: close without an open
		instances[0].emit('close', {});
		// 500ms backoff
		vi.advanceTimersByTime(499);
		expect(instances).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(instances).toHaveLength(2);
		// Second socket closes again -> 1s backoff
		instances[1].emit('close', {});
		vi.advanceTimersByTime(999);
		expect(instances).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(instances).toHaveLength(3);
	});

	test('resets backoff after a successful open', () => {
		createReconnectingClient({ url: 'wss://example/ws' });
		instances[0].emit('close', {});
		vi.advanceTimersByTime(500);
		expect(instances).toHaveLength(2);
		instances[1].emit('open', {});
		instances[1].emit('close', {});
		// After a successful open, backoff is back to 500ms.
		vi.advanceTimersByTime(500);
		expect(instances).toHaveLength(3);
	});

	test('does not reconnect after a manual close()', () => {
		const client = createReconnectingClient({ url: 'wss://example/ws' });
		client.close();
		vi.advanceTimersByTime(60_000);
		expect(instances).toHaveLength(1);
	});

	test('caps backoff at 15 seconds', () => {
		createReconnectingClient({ url: 'wss://example/ws' });
		for (let i = 0; i < 10; i++) {
			instances.at(-1).emit('close', {});
			vi.advanceTimersByTime(20_000);
		}
		// Exact count depends on ramp, but no gap should exceed 15s.
		// Force-close the latest and verify the next one appears within 15s.
		const before = instances.length;
		instances.at(-1).emit('close', {});
		vi.advanceTimersByTime(15_000);
		expect(instances.length).toBeGreaterThan(before);
	});
});
