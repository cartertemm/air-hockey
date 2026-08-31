import { describe, test, expect, beforeEach } from 'vitest';
import {
	Room,
	RoomError,
	createRoom,
	destroyRoom,
	getRoom,
	subscribeLobby,
	unsubscribeLobby,
	initRooms,
	_resetRooms,
} from '../server/room.js';
import { MSG, ERR } from '../network/protocol.js';

function makePlayer(id, name = 'p' + id) {
	return {
		id,
		connected: true,
		data: { name, room: null },
		groups: new Set(),
		sent: [],
		send(msg) { this.sent.push(msg); },
		close() { this.connected = false; },
	};
}

function sentTypes(player) {
	return player.sent.map(m => m.type);
}

function makeFakeServer() {
	const groups = new Map();
	return {
		groups,
		group(name, { persist = false } = {}) {
			let found = groups.get(name);
			if (!found) {
				found = {
					name,
					persist,
					members: new Set(),
					add(client) { this.members.add(client); client.groups.add(this); return this; },
					remove(client) { this.members.delete(client); client.groups.delete(this); return this; },
					send(msg) { for (const c of this.members) c.send(msg); },
					close() { this.members.clear(); groups.delete(name); },
					get clients() { return [...this.members]; },
				};
				groups.set(name, found);
			}
			return found;
		},
	};
}

beforeEach(() => {
	_resetRooms();
	initRooms(makeFakeServer());
});

describe('createRoom', () => {
	test('mints an id, sets host.data.room, broadcasts room:state to host', () => {
		const host = makePlayer('h');
		const room = createRoom(host, { mode: 'bestOf3', pointLimit: 11 });
		expect(host.data.room).toBe(room);
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
		watcher.sent.length = 0; // drop the initial snapshot
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
		host.sent.length = 0;
		watcher.sent.length = 0;

		room.addMember(joiner);

		expect(room.members).toEqual([host, joiner]);
		expect(joiner.data.room).toBe(room);
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

	test('host confirm waits for guest confirm before gameplay starts', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		h.sent.length = 0;
		j.sent.length = 0;
		room.setConfirmed(h);
		expect(room.phase).toBe('ready');
		expect(room.game).toBeNull();
		room.setConfirmed(j);
		expect(room.phase).toBe('playing');
		expect(room.game).toBeDefined();
		expect(sentTypes(h)).toContain(MSG.ROOM_COUNTDOWN);
		expect(sentTypes(j)).toContain(MSG.ROOM_COUNTDOWN);
	});

	test('guest confirm alone does not start gameplay', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		room.setConfirmed(j);
		expect(room.phase).toBe('ready');
		expect(room.game).toBeNull();
	});

	test('guest confirm followed by host confirm starts gameplay', () => {
		const room = createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		const j = makePlayer('j');
		room.addMember(j);
		const [h] = room.members;
		room.setReady(h, true);
		room.setReady(j, true);
		room.setConfirmed(j);
		room.setConfirmed(h);
		expect(room.phase).toBe('playing');
		expect(room.game).toBeDefined();
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
		host.sent.length = 0;
		room.removeMember(joiner, { disconnected: true });
		const state = host.sent.find(m => m.type === MSG.ROOM_STATE);
		expect(state.room.lastEventMessage).toBe('Bob has disconnected.');
	});

	test('explicit leave (no disconnect flag) carries no announcement', () => {
		const host = makePlayer('h', 'Alice');
		const joiner = makePlayer('j', 'Bob');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.addMember(joiner);
		host.sent.length = 0;
		room.removeMember(joiner);
		const state = host.sent.find(m => m.type === MSG.ROOM_STATE);
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
		const last = watcher.sent.at(-1);
		expect(last.type).toBe(MSG.LOBBY_UPDATE);
		expect(last.full).toBe(true);
		expect(last.rooms.map(r => r.id)).toContain(room.id);
	});

	test('unsubscribeLobby stops updates', () => {
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		unsubscribeLobby(watcher);
		watcher.sent.length = 0;
		createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		expect(sentTypes(watcher)).not.toContain(MSG.LOBBY_UPDATE);
	});
});

describe('group fan-out', () => {
	test('room state reaches both members through the room group', () => {
		const host = makePlayer('h');
		const guest = makePlayer('g');
		const room = createRoom(host, { mode: 'single', pointLimit: 7 });
		room.addMember(guest);
		expect(sentTypes(guest)).toContain(MSG.ROOM_STATE);
		expect(sentTypes(host).filter(t => t === MSG.ROOM_STATE).length).toBeGreaterThan(1);
	});

	test('lobby subscribers receive updates through the lobby group', () => {
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		watcher.sent.length = 0;
		createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		expect(sentTypes(watcher)).toContain(MSG.LOBBY_UPDATE);
	});

	test('unsubscribing stops lobby updates', () => {
		const watcher = makePlayer('w');
		subscribeLobby(watcher);
		unsubscribeLobby(watcher);
		watcher.sent.length = 0;
		createRoom(makePlayer('h'), { mode: 'single', pointLimit: 7 });
		expect(sentTypes(watcher)).not.toContain(MSG.LOBBY_UPDATE);
	});
});

