import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'audiogame-utils/net/server';
import { createSocketPair } from 'audiogame-utils/net/testing';
import { attachHandlers } from '../server/handshake.js';
import { _resetRooms, getRoom } from '../server/room.js';
import { MSG, ERR, hello } from '../network/protocol.js';

let game = null;

function connect() {
	const [serverSide, clientSide] = createSocketPair();
	game.accept(serverSide);
	const received = [];
	clientSide.addEventListener('message', (event) => {
		const [channel, payload] = JSON.parse(event.data);
		if (channel === 1) received.push(payload);
	});
	clientSide.send(JSON.stringify([0, { type: 'hello', version: 1, clientId: null, sessionToken: null }]));
	return {
		received,
		socket: clientSide,
		send(msg) { clientSide.send(JSON.stringify([1, msg])); },
	};
}

beforeEach(() => {
	_resetRooms();
	game = createServer();
	attachHandlers(game);
});

afterEach(() => {
	game.close();
});

describe('attachHandlers: hello', () => {
	test('stores the name and sends welcome', () => {
		const peer = connect();
		peer.send(hello({ name: 'Swift Otter' }));
		const welcomed = peer.received.find(m => m.type === MSG.WELCOME);
		expect(welcomed).toBeDefined();
		expect(welcomed.name).toBe('Swift Otter');
	});

	test('anonymous name defaults when name is empty', () => {
		const peer = connect();
		peer.send(hello({ name: '' }));
		expect(peer.received.find(m => m.type === MSG.WELCOME).name).toBe('anonymous');
	});

	test('a game message before hello is rejected', () => {
		const peer = connect();
		peer.send({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 });
		expect(peer.received.find(m => m.type === MSG.ERROR).code).toBe(ERR.BAD_MESSAGE);
	});

	test('a message with no string type is rejected', () => {
		const peer = connect();
		peer.send(hello({ name: 'A' }));
		peer.send({ notAType: true });
		expect(peer.received.find(m => m.type === MSG.ERROR).code).toBe(ERR.BAD_MESSAGE);
	});
});

describe('attachHandlers: dispatcher', () => {
	test('routes ROOM_CREATE to createRoom', () => {
		const peer = connect();
		peer.send(hello({ name: 'Swift Otter' }));
		peer.send({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 });
		const state = peer.received.find(m => m.type === MSG.ROOM_STATE);
		expect(state).toBeDefined();
		expect(getRoom(state.room.id)).not.toBeNull();
	});

	test('ROOM_JOIN on a missing room reports room_not_found', () => {
		const peer = connect();
		peer.send(hello({ name: 'A' }));
		peer.send({ type: MSG.ROOM_JOIN, roomId: 'nope' });
		expect(peer.received.find(m => m.type === MSG.ERROR).code).toBe(ERR.ROOM_NOT_FOUND);
	});

	test('an unknown type reports bad_message', () => {
		const peer = connect();
		peer.send(hello({ name: 'A' }));
		peer.send({ type: 'nonsense' });
		expect(peer.received.find(m => m.type === MSG.ERROR).code).toBe(ERR.BAD_MESSAGE);
	});
});

describe('attachHandlers: disconnect', () => {
	test('a closed socket removes the player from its room and ends the session', () => {
		const peer = connect();
		peer.send(hello({ name: 'A' }));
		peer.send({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 });
		const id = peer.received.find(m => m.type === MSG.ROOM_STATE).room.id;
		peer.socket.close();
		expect(getRoom(id)).toBeNull();
		expect(game.clients.length).toBe(0);
	});
});
