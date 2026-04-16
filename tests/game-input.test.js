import { describe, test, expect } from 'vitest';
import { Game, screenToTable } from '../src/game.js';
import { initKeyboard } from '../src/input/keyboard.js';
import { MSG } from '../network/protocol.js';
import { TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';

function makeFakeSocket() {
	const sent = [];
	return { sent, send(msg) { sent.push(msg); } };
}

function dispatchKey(type, key) {
	window.dispatchEvent(new KeyboardEvent(type, { key }));
}

// Keyboard.js has module-level pressed-key state that leaks between tests
// when a test dispatches keydown without a matching keyup. Release the arrows
// at the top of any test that reads keyboard movement.
function releaseArrows() {
	for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
		dispatchKey('keyup', k);
	}
}

describe('Game input → socket integration', () => {
	test('holding arrow-left after countdown sends INPUT with onTable=true', () => {
		initKeyboard();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p1', pointLimit: 7 });
		dispatchKey('keydown', 'ArrowLeft');
		game.tick(1 / 60);
		game.tick(1 / 60);
		const inputs = socket.sent.filter(m => m.type === MSG.INPUT);
		expect(inputs.length).toBeGreaterThan(0);
		expect(inputs[0].onTable).toBe(true);
	});

	test('pressing p sends PAUSE_TOGGLE', () => {
		initKeyboard();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p1', pointLimit: 7 });
		dispatchKey('keydown', 'p');
		const pauses = socket.sent.filter(m => m.type === MSG.PAUSE_TOGGLE);
		expect(pauses.length).toBe(1);
	});

	// Player 2 sits at the north end of the table looking south, so their
	// screen is mirrored. Touch/screen mapping is already mirrored in
	// screenToTable; the keyboard arrows must mirror the same way.

	test('p1 arrow-right increases world x; p1 arrow-up increases world y', () => {
		initKeyboard();
		releaseArrows();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p1', pointLimit: 7 });
		// Latch onto the table without applying motion this frame.
		dispatchKey('keydown', 'ArrowRight');
		game.tick(1 / 60);
		const startX = game._local.x;
		const startY = game._local.y;
		game.tick(1 / 60);
		expect(game._local.x).toBeGreaterThan(startX);
		dispatchKey('keyup', 'ArrowRight');
		dispatchKey('keydown', 'ArrowUp');
		game.tick(1 / 60);
		expect(game._local.y).toBeGreaterThan(startY);
	});

	test('p2 arrow-right decreases world x (right on screen is left in world)', () => {
		initKeyboard();
		releaseArrows();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p2', pointLimit: 7 });
		dispatchKey('keydown', 'ArrowRight');
		game.tick(1 / 60);
		const startX = game._local.x;
		game.tick(1 / 60);
		expect(game._local.x).toBeLessThan(startX);
	});

	test('p2 arrow-up decreases world y (up on screen is south in world)', () => {
		initKeyboard();
		releaseArrows();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p2', pointLimit: 7 });
		dispatchKey('keydown', 'ArrowUp');
		game.tick(1 / 60);
		const startY = game._local.y;
		game.tick(1 / 60);
		expect(game._local.y).toBeLessThan(startY);
	});

	test('p2 keyboard mirroring matches p2 touch mirroring (right-and-up corner agrees)', () => {
		// Sanity-check: tapping the top-right corner of a p2 screen and
		// holding right+up arrows on a p2 keyboard should both land in the
		// same world quadrant (low x, low y for p2's near side of the table).
		const top = screenToTable(0, 0, 'p2', 100, 100);
		const right = screenToTable(100, 50, 'p2', 100, 100);
		expect(top.y).toBeLessThan(TABLE_LENGTH);
		expect(right.x).toBeLessThan(TABLE_WIDTH / 2);
		// Now keyboard
		initKeyboard();
		releaseArrows();
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		game.client.handleMessage({ type: MSG.GAME_START, localPlayer: 'p2', pointLimit: 7 });
		dispatchKey('keydown', 'ArrowRight');
		dispatchKey('keydown', 'ArrowUp');
		game.tick(1 / 60);
		const startX = game._local.x;
		const startY = game._local.y;
		game.tick(1 / 60);
		// Both axes should move toward p2's near side: x decreases, y decreases.
		expect(game._local.x).toBeLessThan(startX);
		expect(game._local.y).toBeLessThan(startY);
	});
});
