import { describe, test, expect, beforeEach } from 'vitest';
import { handleConnection } from '../server/handshake.js';
import { _resetPlayers } from '../server/player.js';
import { _resetRooms } from '../server/room.js';
import { MSG, hello } from '../network/protocol.js';

function makeFakeSocket() {
	const listeners = { message: [], close: [], error: [] };
	return {
		sent: [],
		readyState: 1,
		addEventListener(type, fn) { listeners[type].push(fn); },
		removeEventListener(type, fn) { listeners[type] = listeners[type].filter(f => f !== fn); },
		send(data) { this.sent.push(JSON.parse(data)); },
		close() { this.readyState = 3; for (const fn of listeners.close) fn({}); },
		emit(type, event) { for (const fn of listeners[type]) fn(event); },
	};
}

function sendMsg(sock, msg) {
	sock.emit('message', { data: JSON.stringify(msg) });
}

function setupRoom() {
	const sock1 = makeFakeSocket();
	handleConnection(sock1);
	sendMsg(sock1, hello({ name: 'Host' }));
	sendMsg(sock1, { type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 });
	const roomId = sock1.sent.find(m => m.type === MSG.ROOM_STATE).room.id;
	const sock2 = makeFakeSocket();
	handleConnection(sock2);
	sendMsg(sock2, hello({ name: 'Guest' }));
	sendMsg(sock2, { type: MSG.ROOM_JOIN, roomId });
	return { sock1, sock2 };
}

beforeEach(() => {
	_resetPlayers();
	_resetRooms();
});

describe('signal relay via server', () => {
	test('SIGNAL_OFFER from host is forwarded to guest', () => {
		const { sock1, sock2 } = setupRoom();
		sock2.sent.length = 0;
		sendMsg(sock1, { type: MSG.SIGNAL_OFFER, sdp: 'v=0...' });
		const relayed = sock2.sent.find(m => m.type === MSG.SIGNAL_OFFER);
		expect(relayed).toBeDefined();
		expect(relayed.sdp).toBe('v=0...');
	});

	test('SIGNAL_ANSWER from guest is forwarded to host', () => {
		const { sock1, sock2 } = setupRoom();
		sock1.sent.length = 0;
		sendMsg(sock2, { type: MSG.SIGNAL_ANSWER, sdp: 'v=0 answer' });
		const relayed = sock1.sent.find(m => m.type === MSG.SIGNAL_ANSWER);
		expect(relayed).toBeDefined();
		expect(relayed.sdp).toBe('v=0 answer');
	});

	test('SIGNAL_ICE from host is forwarded to guest', () => {
		const { sock1, sock2 } = setupRoom();
		sock2.sent.length = 0;
		const candidate = { candidate: 'candidate:...', sdpMid: 'data', sdpMLineIndex: 0 };
		sendMsg(sock1, { type: MSG.SIGNAL_ICE, candidate });
		const relayed = sock2.sent.find(m => m.type === MSG.SIGNAL_ICE);
		expect(relayed).toBeDefined();
		expect(relayed.candidate).toEqual(candidate);
	});

	test('SIGNAL_ICE from guest is forwarded to host', () => {
		const { sock1, sock2 } = setupRoom();
		sock1.sent.length = 0;
		const candidate = { candidate: 'candidate:abc', sdpMid: 'data', sdpMLineIndex: 0 };
		sendMsg(sock2, { type: MSG.SIGNAL_ICE, candidate });
		const relayed = sock1.sent.find(m => m.type === MSG.SIGNAL_ICE);
		expect(relayed).toBeDefined();
		expect(relayed.candidate).toEqual(candidate);
	});

	test('signal sent without a room does nothing (no error)', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendMsg(sock, hello({ name: 'Lonely' }));
		expect(() => sendMsg(sock, { type: MSG.SIGNAL_OFFER, sdp: 'v=0' })).not.toThrow();
	});
});
