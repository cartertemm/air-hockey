import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screenToTable, Game } from '../src/game.js';
import { TABLE_WIDTH, TABLE_LENGTH, MALLET_RADIUS } from '../src/physics.js';
import { State } from '../src/stateMachine.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the input modules so tests don't need a real browser event loop.
vi.mock('../src/input/keyboard.js', () => {
	const pressed = new Set();
	return {
		initKeyboard: vi.fn(),
		isDown: (key) => pressed.has(key.toLowerCase()),
		on: vi.fn(),
		off: vi.fn(),
		_press:   (key) => pressed.add(key.toLowerCase()),
		_release: (key) => pressed.delete(key.toLowerCase()),
		_clear:   ()    => pressed.clear(),
	};
});

vi.mock('../src/input/touch.js', () => ({
	initTouch:   vi.fn(),
	fingerCount: vi.fn(() => 0),
	getAllFingers: vi.fn(() => []),
	on:  vi.fn(),
	off: vi.fn(),
}));

import * as keyboard from '../src/input/keyboard.js';

const HALF = TABLE_LENGTH / 2;

// ─── screenToTable ────────────────────────────────────────────────────────────

describe('screenToTable', () => {
	describe('player 1', () => {
		test('top-left of screen → table left, center line', () => {
			const r = screenToTable(0, 0, 'p1', 100, 100);
			expect(r.x).toBeCloseTo(0);
			expect(r.y).toBeCloseTo(HALF);
		});

		test('top-right of screen → table right, center line', () => {
			const r = screenToTable(100, 0, 'p1', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH);
			expect(r.y).toBeCloseTo(HALF);
		});

		test('bottom-left of screen → table left, P1 goal end (Y=0)', () => {
			const r = screenToTable(0, 100, 'p1', 100, 100);
			expect(r.x).toBeCloseTo(0);
			expect(r.y).toBeCloseTo(0);
		});

		test('bottom-right of screen → table right, P1 goal end (Y=0)', () => {
			const r = screenToTable(100, 100, 'p1', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH);
			expect(r.y).toBeCloseTo(0);
		});

		test('center of screen → table center of P1 half', () => {
			const r = screenToTable(50, 50, 'p1', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH / 2);
			expect(r.y).toBeCloseTo(HALF / 2);
		});
	});

	describe('player 2', () => {
		test('top-left of screen → table right (X mirrored), P2 goal end', () => {
			const r = screenToTable(0, 0, 'p2', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH); // X is mirrored
			expect(r.y).toBeCloseTo(HALF);        // top = center line
		});

		test('bottom-left of screen → table right, P2 goal end (Y=96)', () => {
			const r = screenToTable(0, 100, 'p2', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH);
			expect(r.y).toBeCloseTo(TABLE_LENGTH);
		});

		test('bottom-right of screen → table left, P2 goal end', () => {
			const r = screenToTable(100, 100, 'p2', 100, 100);
			expect(r.x).toBeCloseTo(0);
			expect(r.y).toBeCloseTo(TABLE_LENGTH);
		});

		test('center of screen → center of P2 half', () => {
			const r = screenToTable(50, 50, 'p2', 100, 100);
			expect(r.x).toBeCloseTo(TABLE_WIDTH / 2);
			expect(r.y).toBeCloseTo(HALF + HALF / 2);
		});
	});
});

// ─── Puck placement ───────────────────────────────────────────────────────────

describe('puck placement', () => {
	test('P1 serves: puck placed near P1 goal end', () => {
		const g = new Game({ localPlayer: 'p1' });
		g._placePuck('p1');
		expect(g.physicsState.puck.y).toBeLessThan(HALF);
		expect(g.physicsState.puck.x).toBeCloseTo(TABLE_WIDTH / 2);
		expect(g.physicsState.puck.onTable).toBe(true);
	});

	test('P2 serves: puck placed near P2 goal end', () => {
		const g = new Game({ localPlayer: 'p1' });
		g._placePuck('p2');
		expect(g.physicsState.puck.y).toBeGreaterThan(HALF);
		expect(g.physicsState.puck.x).toBeCloseTo(TABLE_WIDTH / 2);
		expect(g.physicsState.puck.onTable).toBe(true);
	});

	test('served puck has small random drift velocity', () => {
		const g = new Game({ localPlayer: 'p1' });
		g._placePuck('p1');
		const speed = Math.hypot(g.physicsState.puck.vx, g.physicsState.puck.vy);
		expect(speed).toBeGreaterThanOrEqual(0);
		expect(speed).toBeLessThanOrEqual(Math.SQRT2 * 0.5); // max drift on both axes
	});

	test('served puck has zero spin', () => {
		const g = new Game({ localPlayer: 'p1' });
		g._placePuck('p1');
		expect(g.physicsState.puck.omega).toBe(0);
	});
});

// ─── Keyboard mallet ──────────────────────────────────────────────────────────

describe('keyboard mallet movement', () => {
	beforeEach(() => keyboard._clear());

	test('left arrow moves mallet in -X direction', () => {
		const g = new Game({ localPlayer: 'p1' });
		const before = g.physicsState.mallets.p1.x;
		keyboard._press('arrowleft');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.x).toBeLessThan(before);
	});

	test('right arrow moves mallet in +X direction', () => {
		const g = new Game({ localPlayer: 'p1' });
		const before = g.physicsState.mallets.p1.x;
		keyboard._press('arrowright');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.x).toBeGreaterThan(before);
	});

	test('up arrow moves mallet in +Y direction', () => {
		const g = new Game({ localPlayer: 'p1' });
		// Start mid-half so there's room to move up
		g.physicsState.mallets.p1.y = 20;
		keyboard._press('arrowup');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.y).toBeGreaterThan(20);
	});

	test('down arrow moves mallet in -Y direction', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.mallets.p1.y = 20;
		keyboard._press('arrowdown');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.y).toBeLessThan(20);
	});

	test('diagonal movement is normalized (not faster than single axis)', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.mallets.p1.x = 24;
		g.physicsState.mallets.p1.y = 24;
		keyboard._press('arrowup');
		keyboard._press('arrowright');
		g._applyKeyboard('p1', 1);
		const dx = g.physicsState.mallets.p1.x - 24;
		const dy = g.physicsState.mallets.p1.y - 24;
		const dist = Math.hypot(dx, dy);
		// Should travel ~24 in/s (base speed), not 24 * sqrt(2)
		expect(dist).toBeCloseTo(24, 0);
	});

	test('ctrl held doubles movement speed', () => {
		const g = new Game({ localPlayer: 'p1' });
		keyboard._press('arrowleft');

		// Measure base speed distance (short dt avoids wall clamping)
		g.physicsState.mallets.p1.x = 24;
		g._applyKeyboard('p1', 0.1);
		const distBase = 24 - g.physicsState.mallets.p1.x;

		// Measure fast speed distance
		g.physicsState.mallets.p1.x = 24;
		keyboard._press('control');
		g._applyKeyboard('p1', 0.1);
		const distFast = 24 - g.physicsState.mallets.p1.x;

		expect(distFast).toBeCloseTo(distBase * 2, 1);
	});

	test('no keys pressed: mallet does not move', () => {
		const g = new Game({ localPlayer: 'p1' });
		const before = { x: g.physicsState.mallets.p1.x, y: g.physicsState.mallets.p1.y };
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.x).toBe(before.x);
		expect(g.physicsState.mallets.p1.y).toBe(before.y);
	});

	test('mallet clamped to table left edge', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.mallets.p1.x = 0.01;
		keyboard._press('arrowleft');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.x).toBeGreaterThanOrEqual(MALLET_RADIUS);
	});

	test('mallet clamped to table right edge', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.mallets.p1.x = TABLE_WIDTH - 0.01;
		keyboard._press('arrowright');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.x).toBeLessThanOrEqual(TABLE_WIDTH - MALLET_RADIUS);
	});

	test('P1 mallet clamped to P1 half (cannot cross center line)', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.mallets.p1.y = HALF - 0.01;
		keyboard._press('arrowup');
		g._applyKeyboard('p1', 1);
		expect(g.physicsState.mallets.p1.y).toBeLessThanOrEqual(HALF);
	});

	test('P2 mallet clamped to P2 half (cannot cross center line)', () => {
		const g = new Game({ localPlayer: 'p2' });
		g.physicsState.mallets.p2.y = HALF + 0.01;
		keyboard._press('arrowdown');
		g._applyKeyboard('p2', 1);
		expect(g.physicsState.mallets.p2.y).toBeGreaterThanOrEqual(HALF);
	});
});

// ─── State machine wiring ─────────────────────────────────────────────────────

describe('state machine wiring', () => {
	function playingGame() {
		const g = new Game({ localPlayer: 'p1' });
		g.sm.startCountdown('p1');
		g.sm.beginServe();
		g.sm.handlePuckStruck(10);
		return g;
	}

	test('puck:goal event triggers sm.handleGoal', () => {
		const g = playingGame();
		g.emitter.emit('puck:goal', { scoredBy: 'p2' });
		expect(g.sm.scores.p2.points).toBe(1);
	});

	test('puck:off_table event triggers sm.handleOffTable', () => {
		const g = playingGame();
		g.emitter.emit('puck:off_table', { lastTouchedBy: 'p1' });
		expect(g.sm.state).toBe(State.OFF_TABLE);
		expect(g.sm.servingPlayer).toBe('p2');
	});

	test('puck:mallet_hit above threshold transitions SERVE → PLAYING', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.sm.startCountdown('p1');
		g.sm.beginServe();
		expect(g.sm.state).toBe(State.SERVE);
		g.emitter.emit('puck:mallet_hit', { speed: 10 });
		expect(g.sm.state).toBe(State.PLAYING);
	});

	test('serve:assigned places puck on table at correct end', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.physicsState.puck.onTable = false;
		g.emitter.emit('serve:assigned', { player: 'p1' });
		expect(g.physicsState.puck.onTable).toBe(true);
		expect(g.physicsState.puck.y).toBeLessThan(HALF);
	});
});

// ─── Remote mallet ───────────────────────────────────────────────────────────

describe('setRemoteMallet', () => {
	test('updates the non-local player mallet', () => {
		const g = new Game({ localPlayer: 'p1' });
		g.setRemoteMallet(10, 60, 5, -3, true);
		const r = g.physicsState.mallets.p2;
		expect(r.x).toBe(10);
		expect(r.y).toBe(60);
		expect(r.vx).toBe(5);
		expect(r.vy).toBe(-3);
		expect(r.onTable).toBe(true);
	});

	test('P2 as local player: setRemoteMallet updates P1', () => {
		const g = new Game({ localPlayer: 'p2' });
		g.setRemoteMallet(20, 10, 0, 0, false);
		expect(g.physicsState.mallets.p1.x).toBe(20);
	});
});
