import { describe, test, expect, vi } from 'vitest';
import { createGameClient } from '../src/net/gameClient.js';
import { MSG } from '../network/protocol.js';

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
