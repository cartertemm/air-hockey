import { describe, test, expect } from 'vitest';
import {
	step,
	createPuck,
	createMallet,
	TABLE_WIDTH,
	TABLE_LENGTH,
	GOAL_X_MIN,
	GOAL_X_MAX,
	PUCK_RADIUS,
	MALLET_RADIUS,
	MAX_PUCK_VELOCITY,
} from '../src/physics.js';

// Minimal mock emitter that records emitted events.
function mockEmitter() {
	const events = [];
	return {
		events,
		emit(name, data) { events.push({ name, data }); },
		emitted(name) { return events.filter(e => e.name === name); },
	};
}

function makeState(puckOverrides = {}, mallets = {}) {
	return {
		puck: { ...createPuck(), ...puckOverrides },
		mallets,
		lastTouchedBy: null,
	};
}

// ─── Integration ────────────────────────────────────────────────────────────

describe('puck integration', () => {
	test('moves in the direction of velocity', () => {
		const state = makeState({ x: 24, y: 48, vx: 10, vy: -5 });
		// Use tiny dt so friction and wall effects are negligible
		step(state, 0.001);
		expect(state.puck.x).toBeCloseTo(24 + 10 * 0.001, 5);
		expect(state.puck.y).toBeCloseTo(48 + -5 * 0.001, 5);
	});

	test('decelerates over time due to friction', () => {
		const state = makeState({ x: 24, y: 48, vx: 50, vy: 0 });
		const speedBefore = 50;
		step(state, 1, null);
		expect(Math.hypot(state.puck.vx, state.puck.vy)).toBeLessThan(speedBefore);
	});

	test('does nothing when puck is off table', () => {
		const state = makeState({ x: 24, y: 48, vx: 50, vy: 0, onTable: false });
		step(state, 1, null);
		expect(state.puck.x).toBe(24);
		expect(state.puck.vx).toBe(50);
	});
});

// ─── Velocity cap ────────────────────────────────────────────────────────────

describe('velocity cap', () => {
	test('clamps puck speed to MAX_PUCK_VELOCITY on mallet hit', () => {
		// Give mallet an extreme velocity so collision would exceed the cap
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: -1000, onTable: true } },
		);
		step(state, 0.001, null);
		const speed = Math.hypot(state.puck.vx, state.puck.vy);
		expect(speed).toBeLessThanOrEqual(MAX_PUCK_VELOCITY);
	});
});

// ─── Wall collisions ─────────────────────────────────────────────────────────

describe('wall bounces', () => {
	test('bounces off west wall: vx becomes positive', () => {
		const state = makeState({ x: 1, y: 48, vx: -30, vy: 0 });
		step(state, 0.1, null);
		expect(state.puck.vx).toBeGreaterThan(0);
		expect(state.puck.x).toBeGreaterThanOrEqual(PUCK_RADIUS);
	});

	test('bounces off east wall: vx becomes negative', () => {
		const state = makeState({ x: TABLE_WIDTH - 1, y: 48, vx: 30, vy: 0 });
		step(state, 0.1, null);
		expect(state.puck.vx).toBeLessThan(0);
		expect(state.puck.x).toBeLessThanOrEqual(TABLE_WIDTH - PUCK_RADIUS);
	});

	test('bounces off south wall outside goal: vy becomes positive', () => {
		// x = 5 is outside the goal slot (< GOAL_X_MIN)
		const state = makeState({ x: 5, y: 1, vx: 0, vy: -30 });
		step(state, 0.1, null);
		expect(state.puck.vy).toBeGreaterThan(0);
		expect(state.puck.y).toBeGreaterThanOrEqual(PUCK_RADIUS);
	});

	test('bounces off north wall outside goal: vy becomes negative', () => {
		// x = 5 is outside the goal slot
		const state = makeState({ x: 5, y: TABLE_LENGTH - 1, vx: 0, vy: 30 });
		step(state, 0.1, null);
		expect(state.puck.vy).toBeLessThan(0);
		expect(state.puck.y).toBeLessThanOrEqual(TABLE_LENGTH - PUCK_RADIUS);
	});

	test('emits puck:wall_bounce on bounce', () => {
		const em = mockEmitter();
		const state = makeState({ x: 1, y: 48, vx: -30, vy: 0 });
		step(state, 0.1, em);
		expect(em.emitted('puck:wall_bounce')).toHaveLength(1);
	});

	test('does not bounce puck in the goal slot on south wall', () => {
		// Puck aligned with goal center, moving south — should not bounce
		const state = makeState({ x: 24, y: 3, vx: 0, vy: -30 });
		const em = mockEmitter();
		step(state, 0.1, em);
		expect(em.emitted('puck:wall_bounce')).toHaveLength(0);
	});

	test('does not bounce puck in the goal slot on north wall', () => {
		const state = makeState({ x: 24, y: TABLE_LENGTH - 3, vx: 0, vy: 30 });
		const em = mockEmitter();
		step(state, 0.1, em);
		expect(em.emitted('puck:wall_bounce')).toHaveLength(0);
	});
});

// ─── Goal detection ──────────────────────────────────────────────────────────

describe('goal detection', () => {
	test('south goal: p2 scores, puck removed from table', () => {
		const em = mockEmitter();
		// Puck dead-center in goal slot, moving fast south
		const state = makeState({ x: 24, y: 3, vx: 0, vy: -100 });
		step(state, 0.1, em);
		expect(state.puck.onTable).toBe(false);
		const goals = em.emitted('puck:goal');
		expect(goals).toHaveLength(1);
		expect(goals[0].data.scoredBy).toBe('p2');
	});

	test('north goal: p1 scores, puck removed from table', () => {
		const em = mockEmitter();
		const state = makeState({ x: 24, y: TABLE_LENGTH - 3, vx: 0, vy: 100 });
		step(state, 0.1, em);
		expect(state.puck.onTable).toBe(false);
		const goals = em.emitted('puck:goal');
		expect(goals).toHaveLength(1);
		expect(goals[0].data.scoredBy).toBe('p1');
	});

	test('puck outside goal slot does not score', () => {
		const em = mockEmitter();
		// x = 5, which is left of GOAL_X_MIN — hits wall instead
		const state = makeState({ x: 5, y: 3, vx: 0, vy: -100 });
		step(state, 0.1, em);
		expect(state.puck.onTable).toBe(true);
		expect(em.emitted('puck:goal')).toHaveLength(0);
	});
});

// ─── Off-table detection ─────────────────────────────────────────────────────

describe('off-table detection', () => {
	test('emits puck:off_table and removes puck when far outside bounds', () => {
		const em = mockEmitter();
		// Pre-position puck well beyond the off-table margin (no velocity needed)
		const state = makeState({ x: TABLE_WIDTH + 20, y: 48, vx: 0, vy: 0 });
		state.lastTouchedBy = 'p1';
		step(state, 0.001, em);
		expect(state.puck.onTable).toBe(false);
		const events = em.emitted('puck:off_table');
		expect(events).toHaveLength(1);
		expect(events[0].data.lastTouchedBy).toBe('p1');
	});
});

// ─── Mallet collisions ────────────────────────────────────────────────────────

describe('mallet collision', () => {
	test('stationary mallet deflects approaching puck back', () => {
		// Puck below mallet, moving up toward it
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 20 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: 0, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vy).toBeLessThan(0); // bounced back downward
	});

	test('moving mallet transfers velocity to puck', () => {
		// Mallet moving upward fast, puck sitting just below it
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: -50, onTable: true } },
		);
		step(state, 0.001, null);
		// Puck should be launched downward (away from approaching mallet)
		expect(state.puck.vy).toBeLessThan(0);
		expect(Math.abs(state.puck.vy)).toBeGreaterThan(0);
	});

	test('mallet with onTable=false does not affect puck', () => {
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 20 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: 0, onTable: false } },
		);
		step(state, 0.001, null);
		// vy still positive (no deflection)
		expect(state.puck.vy).toBeGreaterThan(0);
	});

	test('mallet hit emits puck:mallet_hit event', () => {
		const em = mockEmitter();
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 20 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: 0, onTable: true } },
		);
		step(state, 0.001, em);
		expect(em.emitted('puck:mallet_hit')).toHaveLength(1);
	});

	test('mallet hit updates lastTouchedBy', () => {
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 20 },
			{ p2: { ...createMallet('p2'), x: 24, y: 48, vx: 0, vy: 0, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.lastTouchedBy).toBe('p2');
	});

	test('puck separated from mallet after collision (no overlap)', () => {
		const state = makeState(
			{ x: 24, y: 43, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 24, y: 48, vx: 0, vy: 0, onTable: true } },
		);
		step(state, 0.001, null);
		const dist = Math.hypot(state.puck.x - 24, state.puck.y - 48);
		expect(dist).toBeGreaterThanOrEqual(PUCK_RADIUS + MALLET_RADIUS - 0.001);
	});
});

// ─── Corner-pin escape ────────────────────────────────────────────────────────
// When the puck is wedged into a corner by two walls, the raw collision normal
// points the puck deeper into the walls — the walls reflect it, but the mallet
// is still in the way. Without tangential redirection the puck can oscillate
// in place or, against a stationary mallet, stop dead. These tests pin down
// the redirected-escape behavior.

describe('corner-pin escape', () => {
	test('SW-corner puck escapes east when mallet approaches from NE', () => {
		const state = makeState(
			{ x: PUCK_RADIUS, y: PUCK_RADIUS, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 5, y: 5, vx: -5, vy: -5, onTable: true } },
		);
		step(state, 0.001, null);
		// Puck must have positive velocity along at least one open axis
		// (east or north) — not driven further into the SW corner.
		expect(state.puck.vx > 0 || state.puck.vy > 0).toBe(true);
	});

	test('SW-corner puck squirts north when mallet pushes primarily from the east', () => {
		// Mallet mostly east of puck → east is blocked, so escape runs along
		// the perpendicular (north) tangent.
		const state = makeState(
			{ x: PUCK_RADIUS, y: PUCK_RADIUS, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 6, y: 3, vx: -5, vy: 0, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vy).toBeGreaterThan(0);
	});

	test('SW-corner puck squirts east when mallet pushes primarily from the north', () => {
		// Mallet mostly north of puck → north is blocked, so escape runs along
		// the perpendicular (east) tangent.
		const state = makeState(
			{ x: PUCK_RADIUS, y: PUCK_RADIUS, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 3, y: 6, vx: 0, vy: -5, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vx).toBeGreaterThan(0);
	});

	test('SE-corner puck escapes west when mallet approaches from NW', () => {
		const state = makeState(
			{ x: TABLE_WIDTH - PUCK_RADIUS, y: PUCK_RADIUS, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: TABLE_WIDTH - 5, y: 5, vx: 5, vy: -5, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vx < 0 || state.puck.vy > 0).toBe(true);
	});

	test('NW-corner puck escapes east when mallet approaches from SE', () => {
		const state = makeState(
			{ x: PUCK_RADIUS, y: TABLE_LENGTH - PUCK_RADIUS, vx: 0, vy: 0 },
			{ p2: { ...createMallet('p2'), x: 5, y: TABLE_LENGTH - 5, vx: -5, vy: 5, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vx > 0 || state.puck.vy < 0).toBe(true);
	});

	test('NE-corner puck escapes when mallet approaches from SW', () => {
		const state = makeState(
			{ x: TABLE_WIDTH - PUCK_RADIUS, y: TABLE_LENGTH - PUCK_RADIUS, vx: 0, vy: 0 },
			{ p2: { ...createMallet('p2'), x: TABLE_WIDTH - 5, y: TABLE_LENGTH - 5, vx: 5, vy: 5, onTable: true } },
		);
		step(state, 0.001, null);
		expect(state.puck.vx < 0 || state.puck.vy < 0).toBe(true);
	});

	test('corner escape completes within a handful of ticks', () => {
		// Simulates repeated contact from a mallet nudging into the corner.
		const state = makeState(
			{ x: PUCK_RADIUS, y: PUCK_RADIUS, vx: 0, vy: 0 },
			{ p1: { ...createMallet('p1'), x: 5, y: 5, vx: -2, vy: -2, onTable: true } },
		);
		for (let i = 0; i < 20; i++) step(state, 1 / 120, null);
		// Puck must have moved out of the literal corner position.
		const dist = Math.hypot(state.puck.x - PUCK_RADIUS, state.puck.y - PUCK_RADIUS);
		expect(dist).toBeGreaterThan(1);
	});
});

// ─── Continuous events ───────────────────────────────────────────────────────

describe('continuous events', () => {
	test('emits puck:moving each step while puck is in play', () => {
		const em = mockEmitter();
		const state = makeState({ x: 24, y: 48, vx: 1, vy: 0 });
		step(state, 0.001, em);
		expect(em.emitted('puck:moving')).toHaveLength(1);
	});

	test('emits mallet:moving for each on-table mallet', () => {
		const em = mockEmitter();
		const state = makeState(
			{ x: 24, y: 48, vx: 1, vy: 0 },
			{
				p1: { ...createMallet('p1'), x: 24, y: 12, onTable: true },
				p2: { ...createMallet('p2'), x: 24, y: 84, onTable: false },
			},
		);
		step(state, 0.001, em);
		const malletEvents = em.emitted('mallet:moving');
		expect(malletEvents).toHaveLength(1);
		expect(malletEvents[0].data.player).toBe('p1');
	});

	test('does not emit puck:moving after a goal', () => {
		const em = mockEmitter();
		const state = makeState({ x: 24, y: 3, vx: 0, vy: -100 });
		step(state, 0.1, em);
		expect(em.emitted('puck:moving')).toHaveLength(0);
	});
});
