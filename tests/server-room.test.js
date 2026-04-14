import { describe, test, expect, beforeEach } from 'vitest';
import { Player, _resetPlayers } from '../server/player.js';
import {
	Room,
	RoomError,
	createRoom,
	destroyRoom,
	getRoom,
	subscribeLobby,
	unsubscribeLobby,
	_resetRooms,
} from '../server/room.js';
import { MSG, ERR } from '../network/protocol.js';

function mockSocket() {
	return { sent: [], send(msg) { this.sent.push(msg); }, close() {} };
}

function makePlayer(id, name = 'p' + id) {
	return new Player({ clientId: id, sessionToken: 't' + id, name, socket: mockSocket() });
}

function sentTypes(player) {
	return player.socket.sent.map(m => m.type);
}

beforeEach(() => {
	_resetRooms();
	_resetPlayers();
});

describe('createRoom', () => {
	test('mints an id, sets host.room, broadcasts room:state to host', () => {
		const host = makePlayer('h');
		const room = createRoom(host, { mode: 'bestOf3', pointLimit: 11 });
		expect(host.room).toBe(room);
		expect(room.phase).toBe('waiting');
		expect(room.mode).toBe('bestOf3');
		expect(room.pointLimit).toBe(11);
		expect(sentTypes(host)).toContain(MSG.ROOM_STATE);
	});

	test('mints unique ids under collision', () => {
		const ids = new Set();
		for (let i = 0; i < 10; i++) {
			ids.add(createRoom(makePlayer('h' + i), { mode: 'single', pointLimit: 7 }).id);
		}
		expect(ids.size).toBe(10);
	});

	test('broadcasts a lobby update to subscribers', () => {
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		watcher.socket.sent.length = 0; // drop the initial snapshot
		createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		expect(sentTypes(watcher)).toContain(MSG.LOBBY_UPDATE);
	});
});

describe('addMember', () => {
	test('joins a second player, broadcasts state to both and lobby update', () => {
		const host = makePlayer('h');
		const joiner = makePlayer('j');
		const watcher = makePlayer('w');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		subscribeLobby(watcher);
		host.socket.sent.length = 0;
		watcher.socket.sent.length = 0;

		room.addMember(joiner);

		expect(room.members).toEqual([host, joiner]);
		expect(joiner.room).toBe(room);
		expect(sentTypes(host)).toContain(MSG.ROOM_STATE);
		expect(sentTypes(joiner)).toContain(MSG.ROOM_STATE);
		expect(sentTypes(watcher)).toContain(MSG.LOBBY_UPDATE);
	});

	test('throws ROOM_FULL when a third player tries to join', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		room.addMember(makePlayer('j'));
		expect(() => room.addMember(makePlayer('x'))).toThrow(RoomError);
		try {
			room.addMember(makePlayer('y'));
		} catch (err) {
			expect(err.code).toBe(ERR.ROOM_FULL);
		}
	});

	test('throws ROOM_NOT_JOINABLE when phase is past waiting', () => {
		const host = makePlayer('h');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.phase = 'countdown';
		expect(() => room.addMember(makePlayer('j'))).toThrow(RoomError);
	});
});

describe('setReady / setConfirmed / countdown', () => {
	test('setReady on only one player leaves phase=waiting', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const [h] = room.members;
		room.setReady(h, true);
		expect(room.phase).toBe('waiting');
	});

	test('setReady on both players flips phase to ready', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		expect(room.phase).toBe('ready');
	});

	test('setReady false on a ready player drops phase back to waiting', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		expect(room.phase).toBe('ready');
		room.setReady(h, false);
		expect(room.phase).toBe('waiting');
	});

	test('setConfirmed on both members flips phase to countdown and broadcasts room:countdown', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		h.socket.sent.length = 0;
		j.socket.sent.length = 0;
		room.setConfirmed(h);
		room.setConfirmed(j);
		expect(room.phase).toBe('countdown');
		expect(sentTypes(h)).toContain(MSG.ROOM_COUNTDOWN);
		expect(sentTypes(j)).toContain(MSG.ROOM_COUNTDOWN);
	});
});

describe('removeMember', () => {
	test('opponent leaves -> remaining player has ready/confirmed cleared', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		room.setConfirmed(h);
		room.removeMember(j);
		expect(room.isReady(h)).toBe(false);
		expect(room.isConfirmed(h)).toBe(false);
		expect(room.phase).toBe('waiting');
	});

	test('host leaving an otherwise-empty room destroys the room', () => {
		const host = makePlayer('h');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.removeMember(host);
		expect(getRoom(room.id)).toBeNull();
	});

	test('disconnect flag attaches a "{name} has disconnected." announcement to the broadcast', () => {
		const host = makePlayer('h', 'Alice');
		const joiner = makePlayer('j', 'Bob');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.addMember(joiner);
		host.socket.sent.length = 0;
		room.removeMember(joiner, { disconnected: true });
		const state = host.socket.sent.find(m => m.type === MSG.ROOM_STATE);
		expect(state.room.lastEventMessage).toBe('Bob has disconnected.');
	});

	test('explicit leave (no disconnect flag) carries no announcement', () => {
		const host = makePlayer('h', 'Alice');
		const joiner = makePlayer('j', 'Bob');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.addMember(joiner);
		host.socket.sent.length = 0;
		room.removeMember(joiner);
		const state = host.socket.sent.find(m => m.type === MSG.ROOM_STATE);
		expect(state.room.lastEventMessage).toBeNull();
	});

	test('disconnect by the only remaining member destroys the room (no lingering 2/2)', () => {
		const host = makePlayer('h', 'Alice');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.removeMember(host, { disconnected: true });
		expect(getRoom(room.id)).toBeNull();
	});
});

describe('lobby subscriptions', () => {
	test('subscribeLobby sends the current snapshot immediately', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		const last = watcher.socket.sent.at(-1);
		expect(last.type).toBe(MSG.LOBBY_UPDATE);
		expect(last.full).toBe(true);
		expect(last.rooms.map(r => r.id)).toContain(room.id);
	});

	test('unsubscribeLobby stops updates', () => {
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		unsubscribeLobby(watcher);
		watcher.socket.sent.length = 0;
		createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		expect(sentTypes(watcher)).not.toContain(MSG.LOBBY_UPDATE);
	});
});

