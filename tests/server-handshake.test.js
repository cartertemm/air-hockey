import { describe, test, expect, beforeEach } from 'vitest';
import { handleConnection } from '../server/handshake.js';
import { _resetPlayers, lookup } from '../server/player.js';
import { _resetRooms, createRoom } from '../server/room.js';
import { MSG, ERR, hello } from '../network/protocol.js';

// A fake socket with the EventTarget surface wrapSocket expects.
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

function sendHello(sock, payload) {
	sock.emit('message', { data: JSON.stringify(hello(payload)) });
}

beforeEach(() => {
	_resetPlayers();
	_resetRooms();
});

describe('handleConnection: first-time client', () => {
	test('mints clientId + sessionToken, registers Player, sends welcome(resumed:false)', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'Swift Otter' });

		const welcomed = sock.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed).toBeDefined();
		expect(welcomed.resumed).toBe(false);
		expect(welcomed.clientId).toMatch(/^[0-9a-f]+$/);
		expect(welcomed.sessionToken).toMatch(/^[0-9a-f]+$/);
		expect(welcomed.name).toBe('Swift Otter');
		expect(lookup(welcomed.clientId)).not.toBeNull();
	});
});

describe('handleConnection: returning client', () => {
	function createPlayerAndDisconnect() {
		const sock1 = makeFakeSocket();
		handleConnection(sock1);
		sendHello(sock1, { name: 'Swift Otter' });
		const welcomed = sock1.sent.find(m => m.type === MSG.WELCOME);
		sock1.close();
		return { clientId: welcomed.clientId, sessionToken: welcomed.sessionToken };
	}

	test('valid token reattaches, rotates token, sends welcome(resumed:true)', () => {
		const { clientId, sessionToken } = createPlayerAndDisconnect();
		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { clientId, sessionToken, name: 'Swift Otter' });
		const welcomed = sock2.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed.resumed).toBe(true);
		expect(welcomed.sessionToken).not.toBe(sessionToken);
	});

	test('wrong token closes the new socket with ERROR unauthorized', () => {
		const { clientId } = createPlayerAndDisconnect();
		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { clientId, sessionToken: 'deadbeef', name: 'x' });
		const errored = sock2.sent.find(m => m.type === MSG.ERROR);
		expect(errored.code).toBe(ERR.UNAUTHORIZED);
		expect(sock2.readyState).toBe(3);
	});

	test('reaped player regenerates identity with resumed:false', () => {
		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { clientId: 'deadbeef', sessionToken: 'oldtoken', name: 'x' });
		const welcomed = sock2.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed.resumed).toBe(false);
		expect(welcomed.clientId).not.toBe('deadbeef');
	});
});

describe('handleConnection: session active', () => {
	test('second live connection with same clientId is rejected', () => {
		const sock1 = makeFakeSocket();
		handleConnection(sock1);
		sendHello(sock1, { name: 'Swift Otter' });
		const { clientId, sessionToken } = sock1.sent.find(m => m.type === MSG.WELCOME);

		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { clientId, sessionToken, name: 'Swift Otter' });
		const errored = sock2.sent.find(m => m.type === MSG.ERROR);
		expect(errored.code).toBe(ERR.SESSION_ACTIVE);
		expect(sock2.readyState).toBe(3);
	});
});

describe('handleConnection: dispatcher', () => {
	test('routes ROOM_CREATE to createRoom for the session player', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'Swift Otter' });
		sock.sent.length = 0;
		sock.emit('message', { data: JSON.stringify({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 }) });
		const state = sock.sent.find(m => m.type === MSG.ROOM_STATE);
		expect(state).toBeDefined();
		expect(state.room.mode).toBe('single');
	});

	test('ROOM_JOIN with unknown room returns ERROR room_not_found', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		sock.sent.length = 0;
		sock.emit('message', { data: JSON.stringify({ type: MSG.ROOM_JOIN, roomId: 'nope' }) });
		const errored = sock.sent.find(m => m.type === MSG.ERROR);
		expect(errored?.code).toBe(ERR.ROOM_NOT_FOUND);
	});
});

describe('handleConnection: disconnect lifecycle', () => {
	test('closing the socket detaches but keeps the player record', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		const { clientId } = sock.sent.find(m => m.type === MSG.WELCOME);
		sock.close();
		const p = lookup(clientId);
		expect(p).not.toBeNull();
		expect(p.isConnected()).toBe(false);
	});
});
