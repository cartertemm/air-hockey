import { describe, test, expect } from 'vitest';
import { GameSession } from '../server/gameSession.js';
import { MALLET_RADIUS, TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';
import { State } from '../src/stateMachine.js';

function makeFakePlayer(clientId) {
	return { clientId, sent: [], send(msg) { this.sent.push(msg); } };
}

function makeSession() {
	const p1 = makeFakePlayer('a');
	const p2 = makeFakePlayer('b');
	const session = new GameSession({ p1, p2, pointLimit: 7 });
	return { p1, p2, session };
}

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
