import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleConnection } from '../server/handshake.js';
import { _resetPlayers, lookup, allPlayers } from '../server/player.js';
import { _resetRooms, getRoom } from '../server/room.js';
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

describe('handleConnection: hello', () => {
	test('mints a fresh Player, registers it, and sends welcome', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'Swift Otter' });
		const welcomed = sock.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed).toBeDefined();
		expect(welcomed.clientId).toMatch(/^[0-9a-f]+$/);
		expect(welcomed.sessionToken).toMatch(/^[0-9a-f]+$/);
		expect(welcomed.name).toBe('Swift Otter');
		expect(lookup(welcomed.clientId)).not.toBeNull();
	});

	test('clientId/sessionToken sent by the client are ignored — every hello mints fresh', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { clientId: 'stale', sessionToken: 'stale', name: 'x' });
		const welcomed = sock.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed.clientId).not.toBe('stale');
		expect(welcomed.sessionToken).not.toBe('stale');
		expect(lookup('stale')).toBeNull();
	});

	test('anonymous name defaults when name is empty', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: '' });
		const welcomed = sock.sent.find(m => m.type === MSG.WELCOME);
		expect(welcomed.name).toBe('anonymous');
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
	test('closing the socket unregisters the player immediately', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		const { clientId } = sock.sent.find(m => m.type === MSG.WELCOME);
		sock.close();
		expect(lookup(clientId)).toBeNull();
		expect([...allPlayers()]).toHaveLength(0);
	});

	test('closing the socket removes the player from their room and destroys empty rooms', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		sock.emit('message', { data: JSON.stringify({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 }) });
		const state = sock.sent.find(m => m.type === MSG.ROOM_STATE);
		const roomId = state.room.id;
		sock.close();
		expect(getRoom(roomId)).toBeNull();
	});

	test('when a second member remains, disconnect broadcasts a "{name} has disconnected." announcement', () => {
		const sock1 = makeFakeSocket();
		handleConnection(sock1);
		sendHello(sock1, { name: 'Alice' });
		sock1.emit('message', { data: JSON.stringify({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 }) });
		const roomId = sock1.sent.find(m => m.type === MSG.ROOM_STATE).room.id;

		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { name: 'Bob' });
		sock2.emit('message', { data: JSON.stringify({ type: MSG.ROOM_JOIN, roomId }) });
		sock1.sent.length = 0;
		sock2.close();

		const state = sock1.sent.find(m => m.type === MSG.ROOM_STATE);
		expect(state.room.lastEventMessage).toBe('Bob has disconnected.');
	});

	test('closing the socket removes the player from lobby subscribers', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		sock.emit('message', { data: JSON.stringify({ type: MSG.LOBBY_SUBSCRIBE }) });
		sock.close();
		// After close, a subsequent room creation should NOT deliver a lobby update
		// to the closed socket.
		const sentBefore = sock.sent.length;
		const sock2 = makeFakeSocket();
		handleConnection(sock2);
		sendHello(sock2, { name: 'y' });
		sock2.emit('message', { data: JSON.stringify({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 }) });
		expect(sock.sent.length).toBe(sentBefore);
	});
});

describe('handleConnection: hello timeout', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	test('closes socket if no hello arrives within the timeout', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		expect(sock.readyState).toBe(1);
		vi.advanceTimersByTime(5000);
		expect(sock.readyState).toBe(3);
	});

	test('does NOT close if hello arrives in time', () => {
		const sock = makeFakeSocket();
		handleConnection(sock);
		sendHello(sock, { name: 'x' });
		vi.advanceTimersByTime(10_000);
		expect(sock.readyState).toBe(1);
	});
});
