import { describe, test, expect, beforeEach } from 'vitest';
import { Player, register, lookup, unregister, allPlayers, reapIdle, _resetPlayers } from '../server/player.js';

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
		expect(p.disconnectedAt).toBeNull();
	});

	test('isConnected reflects socket presence', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: makeMockSocket() });
		expect(p.isConnected()).toBe(true);
		p.detachSocket();
		expect(p.isConnected()).toBe(false);
		expect(p.disconnectedAt).toBeTypeOf('number');
	});

	test('attachSocket clears disconnectedAt', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: null });
		p.disconnectedAt = 123;
		p.attachSocket(makeMockSocket());
		expect(p.disconnectedAt).toBeNull();
	});

	test('send forwards to socket when connected, noops when not', () => {
		const sock = makeMockSocket();
		const p = new Player({ clientId: 'c1', sessionToken: 't1', name: 'x', socket: sock });
		p.send({ type: 'welcome' });
		expect(sock.sent).toHaveLength(1);
		p.detachSocket();
		expect(() => p.send({ type: 'welcome' })).not.toThrow();
	});

	test('rotateToken replaces and returns the new token', () => {
		const p = new Player({ clientId: 'c1', sessionToken: 'old', name: 'x', socket: null });
		const rotated = p.rotateToken();
		expect(rotated).not.toBe('old');
		expect(rotated).toBe(p.sessionToken);
		expect(rotated).toMatch(/^[0-9a-f]+$/);
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

describe('reaper', () => {
	test('reaps disconnected players past the grace window with no room', () => {
		const stale = new Player({ clientId: 'stale', sessionToken: 't', name: 'x', socket: null });
		stale.disconnectedAt = 1000;
		register(stale);
		reapIdle({ now: 1000 + 3 * 60 * 1000, graceMs: 2 * 60 * 1000 });
		expect(lookup('stale')).toBeNull();
	});

	test('does NOT reap disconnected players whose room is non-null', () => {
		const keep = new Player({ clientId: 'keep', sessionToken: 't', name: 'x', socket: null });
		keep.disconnectedAt = 1000;
		keep.room = { id: 'r1' }; // pretend
		register(keep);
		reapIdle({ now: 1000 + 10 * 60 * 1000, graceMs: 2 * 60 * 1000 });
		expect(lookup('keep')).toBe(keep);
	});

	test('does NOT reap players still within the grace window', () => {
		const recent = new Player({ clientId: 'recent', sessionToken: 't', name: 'x', socket: null });
		recent.disconnectedAt = 1000;
		register(recent);
		reapIdle({ now: 1000 + 30 * 1000, graceMs: 2 * 60 * 1000 });
		expect(lookup('recent')).toBe(recent);
	});

	test('does NOT reap currently-connected players', () => {
		const live = new Player({ clientId: 'live', sessionToken: 't', name: 'x', socket: { sent: [], send() {}, close() {} } });
		register(live);
		reapIdle({ now: 1_000_000, graceMs: 0 });
		expect(lookup('live')).toBe(live);
	});
});
