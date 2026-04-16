import { describe, test, expect } from 'vitest';
import { Game } from '../src/game.js';
import { initKeyboard } from '../src/input/keyboard.js';
import { MSG } from '../network/protocol.js';

function makeFakeSocket() {
	const sent = [];
	return { sent, send(msg) { sent.push(msg); } };
}

function dispatchKey(type, key) {
	window.dispatchEvent(new KeyboardEvent(type, { key }));
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
});
