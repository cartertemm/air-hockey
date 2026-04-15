import { describe, test, expect } from 'vitest';
import { GameSession } from '../server/gameSession.js';
import { MALLET_RADIUS, TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';

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
