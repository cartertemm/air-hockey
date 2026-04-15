import { describe, test, expect, vi } from 'vitest';
import { createGameClient } from '../src/net/gameClient.js';
import { MSG } from '../network/protocol.js';
import { Game } from '../src/game.js';

function makeFakeSocket() {
	const sent = [];
	return {
		sent,
		send(msg) { sent.push(msg); },
	};
}

describe('gameClient input throttling', () => {
	test('rapid sendInput calls coalesce to <=60 Hz', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(0));
		const socket = makeFakeSocket();
		const gc = createGameClient({ socket });
		for (let i = 0; i < 100; i++) {
			vi.setSystemTime(new Date(i));
			gc.sendInput({ x: i, y: 0, onTable: true });
		}
		vi.useRealTimers();
		const inputs = socket.sent.filter(msg => msg.type === MSG.INPUT);
		expect(inputs.length).toBeLessThanOrEqual(7);
		expect(inputs.length).toBeGreaterThanOrEqual(5);
	});

	test('first send is immediate; subsequent throttled', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(0));
		const socket = makeFakeSocket();
		const gc = createGameClient({ socket });
		gc.sendInput({ x: 1, y: 2, onTable: true });
		expect(socket.sent.length).toBe(1);
		gc.sendInput({ x: 3, y: 4, onTable: true });
		expect(socket.sent.length).toBe(1);
		vi.setSystemTime(new Date(20));
		gc.sendInput({ x: 5, y: 6, onTable: true });
		expect(socket.sent.length).toBe(2);
		vi.useRealTimers();
	});
});

describe('Game client session', () => {
	test('applies GAME_SNAPSHOT to internal state and emits events in order', () => {
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		const events = [];
		game.on('event', event => events.push(event));
		game.client.handleMessage({
			type: MSG.GAME_START,
			localPlayer: 'p1',
			pointLimit: 7,
		});
		expect(game.localPlayer).toBe('p1');
		game.client.handleMessage({
			type: MSG.GAME_SNAPSHOT,
			tick: 1,
			state: 'PLAYING',
			puck: { x: 24, y: 48, vx: 0, vy: 0, omega: 0, onTable: true },
			mallets: {
				p1: { x: 10, y: 20, vx: 0, vy: 0, onTable: true },
				p2: { x: 30, y: 80, vx: 0, vy: 0, onTable: false },
			},
			scores: { p1: { points: 0 }, p2: { points: 0 } },
			servingPlayer: null,
			events: [
				{ type: 'puck:mallet_hit', x: 10, y: 20, speed: 50, spin: 0, player: 'p1' },
				{ type: 'puck:wall_bounce', x: 48, y: 30, speed: 70 },
			],
		});
		expect(game.snapshot.puck.x).toBe(24);
		expect(events.map(event => event.type)).toEqual(['puck:mallet_hit', 'puck:wall_bounce']);
	});

	test('GAME_END fires gameEnd handler', () => {
		const socket = makeFakeSocket();
		const game = new Game({ socket });
		let ended = null;
		game.on('gameEnd', event => { ended = event; });
		game.client.handleMessage({ type: MSG.GAME_END, winner: 'p2', finalScore: { p1: 3, p2: 7 } });
		expect(ended.winner).toBe('p2');
	});
});
