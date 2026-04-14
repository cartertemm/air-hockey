import { describe, test, expect, beforeEach } from 'vitest';
import { Player, register, lookup, unregister, allPlayers, _resetPlayers } from '../server/player.js';

function makeMockSocket() {
	return { sent: [], send(msg) { this.sent.push(msg); }, close() {} };
}

beforeEach(() => {
	_resetPlayers();
});

describe('Player class', () => {
	test('stores constructor fields', () => {
		const sock = makeMockSocket();
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'Swift Otter', socket: sock });
		expect(p.clientId).toBe('c1');
		expect(p.sessionToken).toBe('t1');
		expect(p.name).toBe('Swift Otter');
		expect(p.socket).toBe(sock);
		expect(p.room).toBeNull();
	});

	test('isConnected reflects socket presence', () => {
		const sock = makeMockSocket();
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: sock });
		expect(p.isConnected()).toBe(true);
		p.socket = null;
		expect(p.isConnected()).toBe(false);
	});

	test('send forwards to socket when connected, noops when not', () => {
		const sock = makeMockSocket();
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: sock });
		p.send({ type: 'welcome' });
		expect(sock.sent).toHaveLength(1);
		p.socket = null;
		expect(() => p.send({ type: 'welcome' })).not.toThrow();
	});

	test('toMemberSnapshot reads ready/confirmed/connected from room and socket', () => {
		const sock = makeMockSocket();
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'Swift Otter', socket: sock });
		const fakeRoom = { isReady: x => x === p, isConfirmed: () => false };
		p.room = fakeRoom;
		expect(p.toMemberSnapshot()).toEqual({
			clientId: 'c1',
			name: 'Swift Otter',
			ready: true,
			confirmed: false,
			connected: true,
		});
	});

	test('toMemberSnapshot falls back to false when room is null', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: makeMockSocket() });
		expect(p.toMemberSnapshot()).toEqual({
			clientId: 'c1', name: 'x', ready: false, confirmed: false, connected: true,
		});
	});
});

describe('registry', () => {
	test('register and lookup', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: null });
		register(p);
		expect(lookup('c1')).toBe(p);
		expect(lookup('missing')).toBeNull();
	});

	test('unregister removes', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: null });
		register(p);
		unregister(p);
		expect(lookup('c1')).toBeNull();
	});

	test('allPlayers iterates current registrations', () => {
		const p1 = new Player({ clientId: 'a', sessionToken: 't', name: 'a', socket: null });
		const p2 = new Player({ clientId: 'b', sessionToken: 't', name: 'b', socket: null });
		register(p1);
		register(p2);
		expect([...allPlayers()]).toEqual([p1, p2]);
	});
});
