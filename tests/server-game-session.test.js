import { describe, test, expect, beforeEach } from 'vitest';
import { GameSession } from '../server/gameSession.js';
import { MSG } from '../network/protocol.js';
import { MALLET_RADIUS, TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';
import { State } from '../src/stateMachine.js';
import { Room, _resetRooms } from '../server/room.js';
import { Player, _resetPlayers } from '../server/player.js';

function makeFakePlayer(clientId) {
	return { clientId, sent: [], send(msg) { this.sent.push(msg); } };
}

function makeSession() {
	const p1 = makeFakePlayer('a');
	const p2 = makeFakePlayer('b');
	const session = new GameSession({ p1, p2, pointLimit: 7 });
	return { p1, p2, session };
}

beforeEach(() => {
	_resetRooms();
	_resetPlayers();
});

describe('GameSession input', () => {
	test('applyInput clamps p1 into south half', () => {
		const { session } = makeSession();
		session.applyInput('p1', { x: 60, y: 80, onTable: true });
		session.tick(1 / 120);
		const m = session.physicsState.mallets.p1;
		expect(m.x).toBe(TABLE_WIDTH - MALLET_RADIUS);
		expect(m.y).toBe(TABLE_LENGTH / 2);
		expect(m.onTable).toBe(true);
	});

	test('applyInput clamps p2 into north half', () => {
		const { session } = makeSession();
		session.applyInput('p2', { x: -5, y: 20, onTable: true });
		session.tick(1 / 120);
		const m = session.physicsState.mallets.p2;
		expect(m.x).toBe(MALLET_RADIUS);
		expect(m.y).toBe(TABLE_LENGTH / 2);
	});

	test('mallet velocity derived from position delta between ticks', () => {
		const { session } = makeSession();
		const dt = 1 / 120;
		session.applyInput('p1', { x: 10, y: 10, onTable: true });
		session.tick(dt);
		session.applyInput('p1', { x: 10.5, y: 10, onTable: true });
		session.tick(dt);
		const m = session.physicsState.mallets.p1;
		expect(m.vx).toBeCloseTo(0.5 / dt, 3);
		expect(m.vy).toBeCloseTo(0, 3);
	});
});

describe('GameSession physics', () => {
	test('puck does not move when state is COUNTDOWN', () => {
		const { session } = makeSession();
		session.physicsState.puck.vx = 50;
		session.tick(1 / 120);
		expect(session.physicsState.puck.x).toBe(TABLE_WIDTH / 2);
	});

	test('puck moves in PLAYING state', () => {
		const { session } = makeSession();
		session._setState(State.PLAYING);
		session.physicsState.puck.vx = 60;
		const dt = 1 / 120;
		session.tick(dt);
		expect(session.physicsState.puck.x).toBeGreaterThan(TABLE_WIDTH / 2);
	});

	test('mallet-puck collision fires puck:mallet_hit event', () => {
		const { session } = makeSession();
		session._setState(State.PLAYING);
		session.physicsState.puck.x = 24;
		session.physicsState.puck.y = 20;
		session.inputBuffer.p1 = { x: 24, y: 22, onTable: true };
		session.tick(1 / 120);
		session.inputBuffer.p1 = { x: 24, y: 19, onTable: true };
		session.tick(1 / 120);
		const types = session.drainPendingEvents().map(e => e.type);
		expect(types).toContain('puck:mallet_hit');
	});
});

describe('GameSession lifecycle', () => {
	test('start() emits countdown events, then SERVE after 3s', () => {
		const { session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		expect(session.stateMachine.state).toBe(State.COUNTDOWN);
		expect(session.pendingEvents.some(event => event.type === 'game:countdown' && event.seconds === 3)).toBe(true);
		session.advanceTo(1000);
		session.advanceTo(2000);
		session.advanceTo(3000);
		expect(session.stateMachine.state).toBe(State.SERVE);
		const counts = session.pendingEvents
			.filter(event => event.type === 'game:countdown')
			.map(event => event.seconds);
		expect(counts).toEqual([3, 2, 1, 0]);
	});

	test('goal transitions to GOAL, holds 2s, then SERVE with scored-on player serving', () => {
		const { session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		session.advanceTo(3000);
		session._setState(State.PLAYING);
		session.physicsState.puck.x = 24;
		session.physicsState.puck.y = 94;
		session.physicsState.puck.vy = 30;
		session.tick(1 / 120);
		expect(session.stateMachine.state).toBe(State.GOAL);
		expect(session.stateMachine.scores.p1.points).toBe(1);
		session.advanceTo(5010);
		expect(session.stateMachine.state).toBe(State.SERVE);
		expect(session.stateMachine.servingPlayer).toBe('p2');
	});

	test('match end triggers onEnd callback with winner', () => {
		const endings = [];
		const p1 = makeFakePlayer('a');
		const p2 = makeFakePlayer('b');
		const session = new GameSession({
			p1,
			p2,
			pointLimit: 1,
			onEnd: (info) => endings.push(info),
		});
		session.start({ now: 0, firstServer: 'p1' });
		session.advanceTo(3000);
		session._setState(State.PLAYING);
		session.physicsState.puck.x = 24;
		session.physicsState.puck.y = 94;
		session.physicsState.puck.vy = 30;
		session.tick(1 / 120);
		session.advanceTo(5010);
		expect(endings).toHaveLength(1);
		expect(endings[0].winner).toBe('p1');
		expect(endings[0].finalScore).toEqual({ p1: 1, p2: 0 });
	});
});

describe('GameSession snapshots', () => {
	test('start() sends GAME_START to both players', () => {
		const { p1, p2, session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		expect(p1.sent[0]?.type).toBe(MSG.GAME_START);
		expect(p1.sent[0].localPlayer).toBe('p1');
		expect(p2.sent[0].localPlayer).toBe('p2');
		expect(p1.sent[0].pointLimit).toBe(7);
	});

	test('broadcastIfDue sends a snapshot every 2nd tick', () => {
		const { p1, p2, session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		const before = p1.sent.length;
		session.tick(1 / 120);
		session.broadcastIfDue();
		expect(p1.sent.length).toBe(before);
		session.tick(1 / 120);
		session.broadcastIfDue();
		expect(p1.sent.length).toBe(before + 1);
		expect(p1.sent[p1.sent.length - 1].type).toBe(MSG.GAME_SNAPSHOT);
		expect(p2.sent[p2.sent.length - 1].type).toBe(MSG.GAME_SNAPSHOT);
	});

	test('snapshot contains puck, mallets, scores, servingPlayer, and draining events', () => {
		const { p1, session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		session.tick(1 / 120);
		session.tick(1 / 120);
		session.broadcastIfDue();
		const snap = p1.sent.find(msg => msg.type === MSG.GAME_SNAPSHOT);
		expect(snap.puck).toHaveProperty('x');
		expect(snap.mallets.p1).toHaveProperty('onTable');
		expect(snap.scores).toEqual({ p1: { points: 0 }, p2: { points: 0 } });
		expect(Array.isArray(snap.events)).toBe(true);
		expect(session.pendingEvents).toEqual([]);
	});
});

describe('GameSession pause', () => {
	test('togglePause from PLAYING enters PAUSED and emits game:paused with byPlayer+byName', () => {
		const { session } = makeSession();
		session._setState(State.PLAYING);
		session.togglePause('p1', 'Alice');
		expect(session.stateMachine.state).toBe(State.PAUSED);
		const event = session.pendingEvents.find(e => e.type === 'game:paused');
		expect(event).toEqual({ type: 'game:paused', byPlayer: 'p1', byName: 'Alice' });
	});

	test('togglePause from PAUSED returns to PLAYING and emits game:resumed with byPlayer+byName', () => {
		const { session } = makeSession();
		session._setState(State.PLAYING);
		session.togglePause('p1', 'Alice');
		session.drainPendingEvents();
		session.togglePause('p2', 'Bob');
		expect(session.stateMachine.state).toBe(State.PLAYING);
		const event = session.pendingEvents.find(e => e.type === 'game:resumed');
		expect(event).toEqual({ type: 'game:resumed', byPlayer: 'p2', byName: 'Bob' });
	});

	test('togglePause from COUNTDOWN is ignored', () => {
		const { session } = makeSession();
		session.start({ now: 0, firstServer: 'p1' });
		session.togglePause('p1', 'Alice');
		expect(session.stateMachine.state).toBe(State.COUNTDOWN);
		expect(session.pendingEvents.some(e => e.type === 'game:paused')).toBe(false);
	});

	test('togglePause from SERVE pauses and resumes back to SERVE', () => {
		const { session } = makeSession();
		session._setState(State.SERVE);
		session.togglePause('p1', 'Alice');
		expect(session.stateMachine.state).toBe(State.PAUSED);
		expect(session.pendingEvents.find(e => e.type === 'game:paused'))
			.toEqual({ type: 'game:paused', byPlayer: 'p1', byName: 'Alice' });
		session.drainPendingEvents();
		session.togglePause('p2', 'Bob');
		expect(session.stateMachine.state).toBe(State.SERVE);
		expect(session.pendingEvents.find(e => e.type === 'game:resumed'))
			.toEqual({ type: 'game:resumed', byPlayer: 'p2', byName: 'Bob' });
	});

	test('paused physics: puck does not move while PAUSED', () => {
		const { session } = makeSession();
		session._setState(State.PLAYING);
		session.physicsState.puck.vx = 60;
		session.togglePause('p1', 'Alice');
		const xBefore = session.physicsState.puck.x;
		session.tick(1 / 120);
		expect(session.physicsState.puck.x).toBe(xBefore);
	});
});

describe('Room ↔ GameSession wiring', () => {
	test('host confirm plus guest confirm starts a GameSession and phase becomes playing', () => {
		const p1 = new Player({ clientId: '1', sessionToken: 'x', name: 'a', socket: { send() {} } });
		const p2 = new Player({ clientId: '2', sessionToken: 'y', name: 'b', socket: { send() {} } });
		const room = new Room({ id: 'r1', host: p1, mode: 'singleMatch', pointLimit: 7 });
		room.addMember(p2);
		room.setReady(p1, true);
		room.setReady(p2, true);
		room.setConfirmed(p1);
		expect(room.phase).toBe('ready');
		room.setConfirmed(p2);
		expect(room.phase).toBe('playing');
		expect(room.game).toBeDefined();
	});

	test('match end resets room to waiting and clears ready/confirmed', () => {
		const p1 = new Player({ clientId: '1', sessionToken: 'x', name: 'a', socket: { send() {} } });
		const p2 = new Player({ clientId: '2', sessionToken: 'y', name: 'b', socket: { send() {} } });
		const room = new Room({ id: 'r1', host: p1, mode: 'singleMatch', pointLimit: 1 });
		room.addMember(p2);
		room.setReady(p1, true);
		room.setReady(p2, true);
		room.setConfirmed(p1);
		room.setConfirmed(p2);
		room.game.onEnd({ winner: 'p1', finalScore: { p1: 1, p2: 0 } });
		expect(room.phase).toBe('waiting');
		expect(room.game).toBeNull();
		expect(room.isReady(p1)).toBe(false);
		expect(room.isConfirmed(p1)).toBe(false);
	});

	test('disconnect mid-match tears down the session', () => {
		const p1 = new Player({ clientId: '1', sessionToken: 'x', name: 'a', socket: { send() {} } });
		const p2 = new Player({ clientId: '2', sessionToken: 'y', name: 'b', socket: { send() {} } });
		const room = new Room({ id: 'r1', host: p1, mode: 'singleMatch', pointLimit: 7 });
		room.addMember(p2);
		room.setReady(p1, true);
		room.setReady(p2, true);
		room.setConfirmed(p1);
		room.setConfirmed(p2);
		room.removeMember(p2, { disconnected: true });
		expect(room.game).toBeNull();
	});
});
